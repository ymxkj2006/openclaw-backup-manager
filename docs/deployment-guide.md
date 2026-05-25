# OpenClaw 备份系统 - 跨电脑部署指南

> 本指南帮助你在任意电脑上部署备份系统，让龙虾能够自动备份配置。

---

## 第一步：复制备份系统

### 方法 A：手动复制
1. 在原电脑找到 `OpenClaw-Backup-Manager.exe`
2. 复制到新电脑的任意目录（如 `D:\Tools\` 或 `C:\Tools\`）

### 方法 B：使用网盘/U盘
1. 找到原电脑的 `OpenClaw-Backup-Manager.exe`（约 72MB）
2. 通过网盘、U盘等方式传输到新电脑

**文件位置（原电脑）：**
```
C:\Users\你的用户名\openclaw-backup-manager\dist\OpenClaw-Backup-Manager.exe
```

---

## 第二步：运行备份系统

1. 双击 `OpenClaw-Backup-Manager.exe`
2. 等待窗口出现，API 服务自动开启
3. 窗口可以最小化，会在后台运行

---

## 第三步：配置龙虾

在龙虾的 AGENTS.md 或 MEMORY.md 中添加：

```markdown
## 🔧 备份系统配置

备份系统路径：填写你放置 exe 的实际路径
API 端口：3456

示例（Windows）：
- C:\Tools\OpenClaw-Backup-Manager.exe
- D:\MyTools\OpenClaw-Backup-Manager.exe

如需启动备份系统，调用：
- 检测在线：GET http://localhost:3456/api/health
- 创建备份：POST http://localhost:3456/api/backup
```

---

## 验证备份系统是否正常工作

### 1. 打开浏览器访问
```
http://localhost:3456/api/health
```

如果显示以下内容，表示正常：
```json
{"success":true,"data":{"status":"ok","timestamp":"2026-05-25T..."}}
```

### 2. 测试创建备份
在浏览器或 curl 中执行：
```bash
curl -X POST http://localhost:3456/api/backup -H "Content-Type: application/json" -d "{\"mode\":\"config\"}"
```

---

## 备份系统目录结构

```
{exe所在目录}\
├── OpenClaw-Backup-Manager.exe    # 主程序
└── backups\                        # 备份文件存储
    ├── backup_2026-05-25_09-30_full.zip
    ├── backup_2026-05-25_10-15_config.zip
    └── ...
```

---

## 常见问题

### Q: 备份系统需要管理员权限吗？
A: 一般不需要。如果无法创建 backups 文件夹，才需要管理员权限。

### Q: 可以修改 API 端口吗？
A: 可以。打开备份系统软件，在「REST API 服务」区域修改端口。

### Q: 备份系统会常驻后台吗？
A: 关闭窗口后程序会退出。如需后台运行，可以用 `start /b` 启动或使用任务计划。

### Q: 如何让备份系统在开机时自动启动？
A: 创建快捷方式，放入：
```
Shell:startup
路径：C:\Users\你的用户名\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\
```

---

## API 快速参考

| 方法 | 地址 | 说明 |
|-----|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/backups` | 列出所有备份 |
| POST | `/api/backup` | 创建备份 |
| POST | `/api/restore` | 恢复备份 |
| GET | `/api/openclaw-dir` | 获取 OpenClaw 目录 |

---

## 完整备份命令

```bash
# 完整备份
curl -X POST http://localhost:3456/api/backup -d "{\"mode\":\"full\"}"

# 仅配置备份
curl -X POST http://localhost:3456/api/backup -d "{\"mode\":\"config\"}"

# 自定义备份（指定文件）
curl -X POST http://localhost:3456/api/backup -d "{\"mode\":\"custom\",\"customFiles\":[\"openclaw.json\"]}"
```

---

## 给龙虾的指令（可直接复制）

```
当你需要修改 OpenClaw 配置时：

1. 先调用 GET http://localhost:3456/api/health 检测备份系统是否在线
2. 如果不在线，启动备份系统（路径：C:\Tools\OpenClaw-Backup-Manager.exe）
3. 根据修改的文件类型选择备份：
   - 修改 openclaw.json → 仅配置备份
   - 修改 skills/agents/configs → 自定义备份
   - 其他 → 完整备份
4. 调用 POST /api/backup 执行备份
5. 备份完成后执行配置修改
```

---

**文件版本：** v1.0.0  
**最后更新：** 2026-05-25