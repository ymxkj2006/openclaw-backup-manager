const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');

let mainWindow;
let apiServer = null;
let apiApp = null;

// ============ Paths ============

function getAppDir() {
    return path.dirname(app.getPath('exe'));
}

function getBackupDir() {
    const backupDir = path.join(getAppDir(), 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
}

function getSettingsPath() {
    return path.join(getAppDir(), 'settings.json');
}

function getOpenClawDir() {
    return path.join(app.getPath('home'), '.openclaw');
}

// ============ Settings ============

function loadSettings() {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return { apiPort: 3456, autoStartApi: true, customFiles: [] };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// ============ Window ============

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 850,
        minHeight: 680,
        backgroundColor: '#0f1419',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.center();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============ API Server ============

function startApiServer(port) {
    if (apiServer) {
        apiServer.close();
    }

    apiApp = express();
    apiApp.use(express.json());

    // CORS
    apiApp.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    // Health
    apiApp.get('/api/health', (req, res) => {
        res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
    });

    // Get OpenClaw dir
    apiApp.get('/api/openclaw-dir', (req, res) => {
        res.json({ success: true, data: { dir: getOpenClawDir(), exists: fs.existsSync(getOpenClawDir()) } });
    });

    // Get settings
    apiApp.get('/api/settings', (req, res) => {
        const settings = loadSettings();
        settings.backupDir = getBackupDir();
        res.json({ success: true, data: settings });
    });

    // Update settings
    apiApp.put('/api/settings', (req, res) => {
        const current = loadSettings();
        const updated = { ...current, ...req.body };
        saveSettings(updated);
        res.json({ success: true, data: updated });
    });

    // List backups
    apiApp.get('/api/backups', (req, res) => {
        const backupDir = getBackupDir();
        try {
            const files = fs.readdirSync(backupDir)
                .filter(f => f.endsWith('.zip'))
                .map(f => {
                    const fullPath = path.join(backupDir, f);
                    const stat = fs.statSync(fullPath);
                    return { name: f, path: fullPath, size: stat.size, createdAt: stat.birthtime.toISOString() };
                })
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            res.json({ success: true, data: files });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    // Create backup
    apiApp.post('/api/backup', async (req, res) => {
        const { mode, customFiles } = req.body;
        const openclawDir = getOpenClawDir();
        const backupDir = getBackupDir();
        const settings = loadSettings();

        if (!fs.existsSync(openclawDir)) {
            res.json({ success: false, error: 'OpenClaw目录不存在' });
            return;
        }

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');

        let filename, sourcePaths;

        if (mode === 'full') {
            filename = `backup_${dateStr}_full.zip`;
            sourcePaths = null; // directory mode
        } else if (mode === 'config') {
            filename = `backup_${dateStr}_config.zip`;
            const configPath = path.join(openclawDir, 'openclaw.json');
            if (!fs.existsSync(configPath)) {
                res.json({ success: false, error: 'openclaw.json 不存在' });
                return;
            }
            sourcePaths = [configPath];
        } else if (mode === 'custom') {
            filename = `backup_${dateStr}_custom.zip`;
            const selectedFiles = customFiles || settings.customFiles || [];
            if (selectedFiles.length === 0) {
                res.json({ success: false, error: '未选择任何文件' });
                return;
            }
            sourcePaths = selectedFiles.map(f => path.join(openclawDir, f)).filter(p => fs.existsSync(p));
            if (sourcePaths.length === 0) {
                res.json({ success: false, error: '选定的文件均不存在' });
                return;
            }
        } else {
            res.json({ success: false, error: '未知的备份模式' });
            return;
        }

        const archivePath = path.join(backupDir, filename);

        try {
            const archiver = require('archiver');
            const output = fs.createWriteStream(archivePath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            await new Promise((resolve, reject) => {
                archive.on('error', err => reject(err));
                archive.on('end', () => resolve());
                archive.pipe(output);

                if (mode === 'full') {
                    archive.directory(openclawDir, '.openclaw');
                } else if (mode === 'config') {
                    archive.file(sourcePaths[0], { name: 'openclaw.json' });
                } else if (mode === 'custom') {
                    sourcePaths.forEach(srcPath => {
                        const relName = path.relative(openclawDir, srcPath);
                        if (fs.statSync(srcPath).isDirectory()) {
                            archive.directory(srcPath, relName);
                        } else {
                            archive.file(srcPath, { name: relName });
                        }
                    });
                }

                archive.finalize();
            });

            const stat = fs.statSync(archivePath);
            const result = { success: true, data: { name: filename, path: archivePath, size: stat.size, createdAt: now.toISOString() } };

            // Notify renderer if window exists
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backup-created', result.data);
            }

            res.json(result);
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    // Restore backup
    apiApp.post('/api/restore', async (req, res) => {
        const { backupPath } = req.body;
        const openclawDir = getOpenClawDir();

        if (!backupPath || !fs.existsSync(backupPath)) {
            res.json({ success: false, error: '备份文件不存在' });
            return;
        }

        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(backupPath);
            const tempDir = path.join(app.getPath('temp'), 'openclaw_restore_' + Date.now());

            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }
            fs.mkdirSync(tempDir, { recursive: true });

            zip.extractAllTo(tempDir, true);

            function copyDir(src, dest) {
                if (!fs.existsSync(src)) return;
                try {
                    fs.mkdirSync(dest, { recursive: true });
                } catch (e) {}
                const items = fs.readdirSync(src);
                for (const item of items) {
                    const srcItem = path.join(src, item);
                    const destItem = path.join(dest, item);
                    try {
                        const stat = fs.statSync(srcItem);
                        if (stat.isDirectory()) {
                            copyDir(srcItem, destItem);
                        } else {
                            fs.copyFileSync(srcItem, destItem);
                            try {
                                fs.utimesSync(destItem, stat.atime, stat.mtime);
                            } catch (e) {}
                        }
                    } catch (e) {
                        console.log('Skipped: ' + srcItem + ' - ' + e.message);
                    }
                }
            }

            const entries = fs.readdirSync(tempDir);
            const openclawEntry = entries.find(e => e === '.openclaw');
            const srcDir = openclawEntry ? path.join(tempDir, '.openclaw') : tempDir;

            copyDir(srcDir, openclawDir);
            fs.rmSync(tempDir, { recursive: true });

            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    apiServer = apiApp.listen(port, () => {
        console.log(`API server running on port ${port}`);
    });

    apiServer.on('error', (err) => {
        console.error('API server error:', err);
    });
}

function stopApiServer() {
    if (apiServer) {
        apiServer.close();
        apiServer = null;
        apiApp = null;
    }
}

// ============ IPC Handlers ============

ipcMain.handle('get-openclaw-dir', () => getOpenClawDir());
ipcMain.handle('get-backup-dir', () => getBackupDir());
ipcMain.handle('get-app-dir', () => getAppDir());

ipcMain.handle('check-openclaw-exists', () => fs.existsSync(getOpenClawDir()));

ipcMain.handle('get-dir-stats', async (event, dirPath) => {
    try {
        if (!fs.existsSync(dirPath)) return null;
        let totalSize = 0;
        let fileCount = 0;

        function calcSize(dir) {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    calcSize(fullPath);
                } else {
                    totalSize += stat.size;
                    fileCount++;
                }
            }
        }
        calcSize(dirPath);
        return { size: totalSize, fileCount, exists: true };
    } catch (e) {
        return null;
    }
});

// File tree for custom mode
ipcMain.handle('get-file-tree', async (event, dirPath) => {
    try {
        if (!fs.existsSync(dirPath)) return [];

        function buildTree(dir, prefix = '') {
            const items = [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                // Skip node_modules and hidden files
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                
                const fullPath = path.join(dir, entry.name);
                const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
                
                if (entry.isDirectory()) {
                    items.push({ name: entry.name, path: relPath, type: 'dir', children: buildTree(fullPath) });
                } else {
                    items.push({ name: entry.name, path: relPath, type: 'file' });
                }
            }
            return items;
        }

        return buildTree(dirPath);
    } catch (e) {
        return [];
    }
});

// Settings
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (event, settings) => {
    saveSettings(settings);
    return loadSettings();
});

// API control
ipcMain.handle('start-api', (event, port) => {
    const settings = loadSettings();
    const actualPort = port || settings.apiPort;
    startApiServer(actualPort);
    return { success: true, port: actualPort };
});

ipcMain.handle('stop-api', () => {
    stopApiServer();
    return { success: true };
});

ipcMain.handle('get-api-status', () => {
    return { running: apiServer !== null };
});

// Backup operations
ipcMain.handle('list-backups', async () => {
    const backupDir = getBackupDir();
    try {
        return fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.zip'))
            .map(f => {
                const fullPath = path.join(backupDir, f);
                const stat = fs.statSync(fullPath);
                return { name: f, path: fullPath, size: stat.size, createdAt: stat.birthtime.toISOString() };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
        return [];
    }
});

ipcMain.handle('create-backup', async (event, mode) => {
    const openclawDir = getOpenClawDir();
    const backupDir = getBackupDir();
    const settings = loadSettings();

    if (!fs.existsSync(openclawDir)) {
        return { success: false, error: 'OpenClaw目录不存在' };
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');

    let filename, sourcePaths;

    if (mode === 'full') {
        filename = `backup_${dateStr}_full.zip`;
        sourcePaths = null;
    } else if (mode === 'config') {
        filename = `backup_${dateStr}_config.zip`;
        const configPath = path.join(openclawDir, 'openclaw.json');
        if (!fs.existsSync(configPath)) {
            return { success: false, error: 'openclaw.json 不存在' };
        }
        sourcePaths = [configPath];
    } else {
        return { success: false, error: '未知的备份模式' };
    }

    const archivePath = path.join(backupDir, filename);

    try {
        const archiver = require('archiver');
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        await new Promise((resolve, reject) => {
            archive.on('error', err => reject(err));
            archive.on('end', () => resolve());
            archive.pipe(output);

            if (mode === 'full') {
                archive.directory(openclawDir, '.openclaw');
            } else {
                archive.file(sourcePaths[0], { name: 'openclaw.json' });
            }

            archive.finalize();
        });

        const stat = fs.statSync(archivePath);
        return {
            success: true,
            backup: { name: filename, path: archivePath, size: stat.size, createdAt: now.toISOString() }
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('restore-backup', async (event, backupPath) => {
    const openclawDir = getOpenClawDir();
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '确认恢复',
        message: '恢复备份将覆盖当前配置，是否继续？',
        buttons: ['取消', '确认恢复'],
        defaultId: 0
    });

    if (result.response !== 1) {
        return { success: false, error: '用户取消' };
    }

    try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(backupPath);
        const tempDir = path.join(app.getPath('temp'), 'openclaw_restore_' + Date.now());

        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
        fs.mkdirSync(tempDir, { recursive: true });

        zip.extractAllTo(tempDir, true);

        function copyDir(src, dest) {
            if (!fs.existsSync(src)) return;
            try {
                fs.mkdirSync(dest, { recursive: true });
            } catch (e) {}
            const items = fs.readdirSync(src);
            for (const item of items) {
                const srcItem = path.join(src, item);
                const destItem = path.join(dest, item);
                try {
                    const stat = fs.statSync(srcItem);
                    if (stat.isDirectory()) {
                        copyDir(srcItem, destItem);
                    } else {
                        fs.copyFileSync(srcItem, destItem);
                        try {
                            fs.utimesSync(destItem, stat.atime, stat.mtime);
                        } catch (e) {}
                    }
                } catch (e) {
                    // Skip files that can't be copied (locked, permission, etc.)
                    console.log('Skipped: ' + srcItem + ' - ' + e.message);
                }
            }
        }

        const entries = fs.readdirSync(tempDir);
        const openclawEntry = entries.find(e => e === '.openclaw');
        const srcDir = openclawEntry ? path.join(tempDir, '.openclaw') : tempDir;

        copyDir(srcDir, openclawDir);
        fs.rmSync(tempDir, { recursive: true });

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-backup', async (event, backupPath) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '确认删除',
        message: '确定要删除这个备份吗？此操作不可撤销。',
        buttons: ['取消', '删除'],
        defaultId: 0
    });

    if (result.response !== 1) {
        return { success: false, error: '用户取消' };
    }

    try {
        fs.unlinkSync(backupPath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('launch-openclaw', async () => {
    return new Promise((resolve) => {
        const proc = spawn('openclaw', ['gateway', 'start'], {
            detached: true,
            stdio: 'ignore',
            shell: true
        });
        proc.unref();
        setTimeout(() => resolve({ success: true }), 1500);
    });
});

ipcMain.handle('check-openclaw-cli', async () => {
    return new Promise((resolve) => {
        const proc = spawn('where', ['openclaw'], { shell: true });
        let found = false;
        proc.stdout.on('data', () => { found = true; });
        proc.on('close', () => resolve(found));
    });
});

ipcMain.handle('open-in-explorer', (event, filePath) => {
    shell.showItemInFolder(filePath);
});

ipcMain.handle('open-url', (event, url) => {
    shell.openExternal(url);
});

// ============ App Lifecycle ============

app.whenReady().then(() => {
    createWindow();

    // Auto-start API if enabled
    const settings = loadSettings();
    if (settings.autoStartApi) {
        startApiServer(settings.apiPort);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    stopApiServer();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    stopApiServer();
});