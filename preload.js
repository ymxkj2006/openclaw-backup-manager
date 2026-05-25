const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Paths
    getOpenClawDir: () => ipcRenderer.invoke('get-openclaw-dir'),
    getBackupDir: () => ipcRenderer.invoke('get-backup-dir'),
    getAppDir: () => ipcRenderer.invoke('get-app-dir'),
    checkOpenClawExists: () => ipcRenderer.invoke('check-openclaw-exists'),
    getDirStats: (dirPath) => ipcRenderer.invoke('get-dir-stats', dirPath),

    // File tree for custom mode
    getFileTree: (dirPath) => ipcRenderer.invoke('get-file-tree', dirPath),

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // API control
    startApi: (port) => ipcRenderer.invoke('start-api', port),
    stopApi: () => ipcRenderer.invoke('stop-api'),
    getApiStatus: () => ipcRenderer.invoke('get-api-status'),

    // Backups
    listBackups: () => ipcRenderer.invoke('list-backups'),
    createBackup: (mode) => ipcRenderer.invoke('create-backup', mode),
    restoreBackup: (backupPath) => ipcRenderer.invoke('restore-backup', backupPath),
    deleteBackup: (backupPath) => ipcRenderer.invoke('delete-backup', backupPath),

    // OpenClaw
    launchOpenClaw: () => ipcRenderer.invoke('launch-openclaw'),
    checkOpenClawCLI: () => ipcRenderer.invoke('check-openclaw-cli'),

    // File operations
    openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
    openUrl: (url) => ipcRenderer.invoke('open-url', url),

    // Listen for backup-created events from API
    onBackupCreated: (callback) => {
        ipcRenderer.on('backup-created', (event, data) => callback(data));
    }
});