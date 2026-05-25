# OpenClaw 自动备份配置

> 本文件实现：当 OpenClaw 修改配置前，自动检测并启动备份系统，完成备份后再执行修改。

---

## 配置变量（请根据实际环境修改）

```javascript
// 备份系统 exe 路径（必须修改为实际路径）
const BACKUP_APP_PATH = "C:\\Users\\tutule\\openclaw-backup-manager\\dist\\OpenClaw-Backup-Manager.exe";

// 备份系统 API 端口（默认 3456，无需修改）
const BACKUP_API_PORT = 3456;

// API 地址
const BACKUP_API_URL = `http://localhost:${BACKUP_API_PORT}/api`;
```

---

## 核心工作流程

### 修改配置前的备份流程

```
1. 调用 GET /api/health 检测备份系统是否在线
   ├─ 在线 → 继续 Step 2
   └─ 不在线 → 启动备份系统 → 等待 → 继续 Step 2

2. 根据修改的文件类型选择备份模式：
   ├─ 修改 openclaw.json → 仅配置备份 (mode: "config")
   ├─ 修改 skills/*.md → 自定义备份 (customFiles: ["skills/xxx/"])
   ├─ 修改 agents/*.md → 自定义备份 (customFiles: ["agents/xxx/"])
   └─ 其他 / 未知 → 完整备份 (mode: "full")

3. 调用 POST /api/backup 执行备份

4. 备份成功后继续执行修改
```

---

## API 调用函数

```javascript
// ========== 备份工具控制 ==========

// 检测备份系统是否在线
async function isBackupSystemOnline() {
    try {
        const response = await fetch(`${BACKUP_API_URL}/health`);
        return response.ok;
    } catch {
        return false;
    }
}

// 启动备份系统
async function startBackupSystem() {
    return new Promise((resolve, reject) => {
        try {
            const { spawn } = require('child_process');
            const proc = spawn(BACKUP_APP_PATH, [], {
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            proc.unref();
            
            // 等待启动（最多 10 秒）
            let waited = 0;
            const waitInterval = setInterval(async () => {
                waited += 500;
                if (await isBackupSystemOnline()) {
                    clearInterval(waitInterval);
                    resolve(true);
                } else if (waited >= 10000) {
                    clearInterval(waitInterval);
                    reject(new Error('启动备份系统超时'));
                }
            }, 500);
        } catch (e) {
            reject(e);
        }
    });
}

// 确保备份系统在线
async function ensureBackupSystemOnline() {
    if (!(await isBackupSystemOnline())) {
        console.log('[备份] 备份系统未运行，正在启动...');
        await startBackupSystem();
        console.log('[备份] 备份系统已启动');
    }
}

// ========== 备份操作 ==========

// 创建完整备份
async function createFullBackup() {
    await ensureBackupSystemOnline();
    
    const response = await fetch(`${BACKUP_API_URL}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'full' })
    });
    
    const result = await response.json();
    if (result.success) {
        console.log(`[备份] 完整备份成功: ${result.data.name}`);
        return result.data;
    } else {
        throw new Error(`备份失败: ${result.error}`);
    }
}

// 创建仅配置备份
async function createConfigBackup() {
    await ensureBackupSystemOnline();
    
    const response = await fetch(`${BACKUP_API_URL}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'config' })
    });
    
    const result = await response.json();
    if (result.success) {
        console.log(`[备份] 配置备份成功: ${result.data.name}`);
        return result.data;
    } else {
        throw new Error(`备份失败: ${result.error}`);
    }
}

// 创建自定义备份（指定文件）
async function createCustomBackup(filePaths) {
    await ensureBackupSystemOnline();
    
    const response = await fetch(`${BACKUP_API_URL}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: 'custom',
            customFiles: Array.isArray(filePaths) ? filePaths : [filePaths]
        })
    });
    
    const result = await response.json();
    if (result.success) {
        console.log(`[备份] 自定义备份成功: ${result.data.name}`);
        return result.data;
    } else {
        throw new Error(`备份失败: ${result.error}`);
    }
}

// ========== 备份决策 ==========

// 根据修改的文件决定备份模式
function decideBackupMode(filePath) {
    const path = filePath.toLowerCase();
    
    if (path.includes('openclaw.json')) {
        return 'config';
    } else if (path.includes('\\skills\\') || path.includes('/skills/')) {
        return 'custom';
    } else if (path.includes('\\agents\\') || path.includes('/agents/')) {
        return 'custom';
    } else if (path.includes('\\configs\\') || path.includes('/configs/')) {
        return 'custom';
    } else if (path.includes('\\workspace\\') || path.includes('/workspace/')) {
        return 'custom';
    }
    
    return 'full';
}

// 获取相关文件路径（用于自定义备份）
function getRelatedFiles(filePath) {
    const path = filePath.replace(/\\/g, '/');
    const parts = path.split('/');
    
    // 提取父目录路径（如 skills/main/）
    if (parts.length >= 2) {
        const parentParts = parts.slice(0, -1); // 去掉文件名
        const parentPath = parentParts.join('/') + '/';
        
        // 检查是否是具体文件还是目录
        if (filePath.includes('\\')) {
            // Windows
            const winParent = parentPath.replace(/\//g, '\\');
            return [winParent.slice(0, -1)]; // 去掉末尾 /
        }
        return [parentPath.slice(0, -1)];
    }
    
    return [filePath];
}
```

---

## 使用示例

### 场景 1：修改 openclaw.json

```javascript
// 修改 openclaw.json 前
const filePath = "C:\\Users\\tutule\\.openclaw\\openclaw.json";

// 方法 A：自动选择备份模式
const mode = decideBackupMode(filePath);
if (mode === 'config') {
    await createConfigBackup();
} else if (mode === 'custom') {
    await createCustomBackup(getRelatedFiles(filePath));
} else {
    await createFullBackup();
}

// 方法 B：直接指定配置备份
await createConfigBackup();

// ... 执行 openclaw.json 修改 ...
```

### 场景 2：修改 skills 配置

```javascript
const filePath = "C:\\Users\\tutule\\.openclaw\\skills\\example-skill\\SKILL.md";
const files = getRelatedFiles(filePath); // 返回 ["skills/example-skill/"]
await createCustomBackup(files);
```

### 场景 3：批量修改前完整备份

```javascript
// 执行多个修改前
await createFullBackup();

// ... 执行多个修改 ...
```

---

## 一键使用（在 AGENTS.md 或记忆中引用）

```javascript
// 快速备份（添加到 AGENTS.md 或记忆）
const backup = async (filePath) => {
    const mode = decideBackupMode(filePath);
    if (mode === 'config') await createConfigBackup();
    else if (mode === 'custom') await createCustomBackup(getRelatedFiles(filePath));
    else await createFullBackup();
};
```

---

## 注意事项

1. **首次使用必须修改 `BACKUP_APP_PATH`** 为实际 exe 路径
2. 备份文件存储在 exe 同目录的 `backups/` 子文件夹
3. API 端口默认 3456，backup 系统界面可修改
4. 备份操作为异步，不会阻塞 OpenClaw 运行

---

## 相关文件

- 备份系统下载：`dist/OpenClaw-Backup-Manager.exe`
- 备份历史查看：打开备份系统 → 备份历史 tab
- API 文档：备份系统 → REST API 服务 section