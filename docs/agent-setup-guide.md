# OpenClaw 自动备份 - Agent 配置指南

> 复制以下内容到 AGENTS.md 或相关记忆文件中

---

## 📋 首次配置（必须）

将以下配置添加到你的记忆文件（MEMORY.md 或 AGENTS.md 底部）：

```markdown
## 🔧 备份系统配置

备份系统路径：
- Windows: `C:\Users\你的用户名\openclaw-backup-manager\dist\OpenClaw-Backup-Manager.exe`
- 备份系统 API 端口：3456

如路径不同，请更新 `BACKUP_APP_PATH` 变量。
```

---

## 🚀 使用方法（简单版）

当你需要修改 OpenClaw 配置时：

### Step 1：告诉我你要修改什么

```
示例 1：我要修改 openclaw.json
示例 2：我要修改 skills/my-skill/SKILL.md
示例 3：我要修改 agents/main/agent.md
```

### Step 2：我会自动处理

我会自动：
1. 检测备份系统是否在线
2. 不在线则启动备份系统
3. 根据文件类型选择备份方式
4. 执行备份
5. 然后进行修改

### Step 3：备份结果

备份成功后我会告诉你：
- 备份类型（完整/配置/自定义）
- 备份文件名

---

## 🎯 备份规则

| 修改的文件类型 | 备份方式 | 说明 |
|---------------|---------|------|
| `openclaw.json` | 仅配置备份 | 快速备份核心配置 |
| `skills/*.md` | 自定义备份 | 只备份该 skill 目录 |
| `agents/*.md` | 自定义备份 | 只备份该 agent 目录 |
| `configs/*` | 自定义备份 | 只备份该配置目录 |
| `workspace/*.md` | 自定义备份 | 只备份该文件 |
| 其他 / 批量修改 | 完整备份 | 备份整个 .openclaw |

---

## 🔧 路径配置（如果你的路径不同）

如果你复制到了其他位置，需要告诉我更新：

```javascript
// 在 agent.md 或记忆中找到这行，修改为实际路径
const BACKUP_APP_PATH = "实际路径\\OpenClaw-Backup-Manager.exe";
```

---

## ❓ 常见问题

**Q: 备份系统在哪里？**
A: 和你的 OpenClaw 配置在同一台电脑，路径在配置中指定。

**Q: 备份会覆盖之前的备份吗？**
A: 不会。每次备份都会创建新文件，文件名包含时间戳。

**Q: 备份存储在哪里？**
A: 在备份系统 exe 同目录的 `backups/` 文件夹中。

**Q: 怎么恢复备份？**
A: 打开备份系统，在备份历史中点击恢复按钮。

---

## 📁 快速参考

```
备份系统路径：C:\Users\用户名\openclaw-backup-manager\dist\OpenClaw-Backup-Manager.exe
API 地址：http://localhost:3456/api
备份存储目录：{exe所在目录}\backups\
```

---

如需手动触发备份，直接告诉我「执行备份」即可。