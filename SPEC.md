# OpenClaw 配置备份恢复系统 - 规格说明书

## 1. 项目概述

**项目名称：** OpenClaw Backup Manager  
**类型：** 独立桌面应用（Electron）  
**核心功能：** 自动检测、备份、恢复 OpenClaw 配置目录，支持 REST API 远程触发备份  
**目标用户：** OpenClaw 高级用户，需要定期备份或迁移配置

---

## 2. UI/UX 规格

### 2.1 窗口配置
- **窗口尺寸：** 900 x 700 px（最小）
- **窗口标题：** OpenClaw 配置备份恢复系统
- **可调整大小：** 是
- **居中显示：** 是

### 2.2 视觉风格
- **主题：** 深色现代风格
- **背景色：** `#0f1419`（深灰黑）
- **卡片背景：** `#1a1f26`（略浅灰）
- **主色调：** `#3b82f6`（蓝色）
- **成功色：** `#22c55e`（绿色）
- **警告色：** `#f59e0b`（橙色）
- **危险色：** `#ef4444`（红色）
- **文字主色：** `#e5e7eb`
- **文字次色：** `#9ca3af`
- **字体：** Segoe UI, sans-serif
- **圆角：** 8px（卡片），6px（按钮）

### 2.3 布局结构
```
┌──────────────────────────────────────────────────┐
│  Header: Logo + Title + Status + API Port       │
├─────────────────────────┬────────────────────────┤
│  OpenClaw 目录信息      │  备份存储目录信息        │
│  [打开文件夹]           │  [打开文件夹]            │
├─────────────────────────┴────────────────────────┤
│  备份模式选择 (完整/仅配置/自定义)                │
│  [文件树选择器 - 自定义模式]                     │
│  已选文件: xxx, xxx                              │
├──────────────────────────────────────────────────┤
│  [💾 创建备份]          [▶️ 一键启动]             │
├──────────────────────────────────────────────────┤
│  备份历史列表 (恢复/删除/打开文件夹)             │
├──────────────────────────────────────────────────┤
│  API 服务状态: 运行中 | 端口: 3456 | [切换开关]  │
└──────────────────────────────────────────────────┘
```

### 2.4 组件规格

**卡片：**
- 内边距：20px
- 边框：1px solid rgba(255,255,255,0.1)
- 圆角：8px

**按钮：**
- 主按钮：蓝色背景，白色文字，hover 亮度+10%
- 次按钮：透明背景，边框，hover 背景半透明
- 危险按钮：红色背景

**目录卡片：**
- 左侧显示路径，右上角「📂 打开文件夹」按钮
- 路径使用等宽字体

**文件选择器（自定义模式）：**
- 树形结构展示 `.openclaw` 目录内容
- Checkbox 勾选要备份的文件/文件夹
- 选中状态持久化到 `settings.json`

---

## 3. 功能规格

### 3.1 自动检测源目录
- 启动时自动检测：`C:\Users\<username>\.openclaw`
- 检测 `openclaw.json` 是否存在以验证目录有效性
- 「打开文件夹」按钮：调用 `shell.showItemInFolder`

### 3.2 备份存储目录
- 固定在应用目录下：`{app}/backups/`
- 启动时自动创建（如果不存在）

### 3.3 备份模式
| 模式 | 描述 | 输出 |
|------|------|------|
| 完整备份 | 压缩整个 `.openclaw` 目录 | `backup_YYYY-MM-DD_HH-mm_full.zip` |
| 仅配置 | 仅备份 `openclaw.json` | `backup_YYYY-MM-DD_HH-mm_config.zip` |
| 自定义 | 用户勾选的特定文件/目录 | `backup_YYYY-MM-DD_HH-mm_custom.zip` |

### 3.4 自定义模式 - 文件选择器
- 启动时扫描 `.openclaw` 目录，生成树形结构
- 每个节点有 Checkbox，可勾选/取消勾选
- 勾选状态保存在 `settings.json` 的 `customFiles` 数组
- 下次打开自动恢复上次的勾选状态
- 显示已选文件/目录数量

### 3.5 备份操作
- 使用 Node.js `archiver` 库创建 ZIP
- 备份文件名格式：`backup_{date}_{time}_{mode}.zip`

### 3.6 一键启动 OpenClaw
- 通过 `child_process.spawn` 执行 `openclaw gateway start`
- 检测是否已安装 OpenClaw CLI

### 3.7 备份历史管理
- 列表展示：文件名、备份时间、备份类型、大小
- 操作：恢复、删除、「打开文件夹」（定位到文件）
- 恢复前需确认（危险操作提示）
- 删除需二次确认

### 3.8 REST API 服务
- 内置 Express HTTP 服务
- 默认端口：`3456`
- 端口可在设置中修改
- 启动时自动开启（可关闭）

**API 端点：**

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回 `{status: "ok"}` |
| GET | `/api/backups` | 列出所有备份 |
| POST | `/api/backup` | 创建备份，Body: `{mode: "full\|config\|custom"}` |
| POST | `/api/restore` | 恢复备份，Body: `{backupPath: "..."}` |
| GET | `/api/openclaw-dir` | 获取 OpenClaw 目录路径 |
| GET | `/api/settings` | 获取当前设置 |
| PUT | `/api/settings` | 更新设置，Body: `{apiPort: 3456, autoStartApi: true}` |

**响应格式：**
```json
// 成功
{"success": true, "data": {...}}

// 失败
{"success": false, "error": "错误信息"}
```

### 3.9 设置持久化
- 设置文件：`{app}/settings.json`
- 保存内容：
  - `backupDir` - 备份存储目录（固定在 app 目录下）
  - `apiPort` - API 服务端口（默认 3456）
  - `autoStartApi` - 启动时自动开启 API（默认 true）
  - `customFiles` - 自定义模式选择的文件列表

---

## 4. 数据结构

### 4.1 设置文件 (`settings.json`)
```json
{
  "apiPort": 3456,
  "autoStartApi": true,
  "customFiles": [
    "openclaw.json",
    "configs/",
    "skills/"
  ]
}
```

### 4.2 备份记录（内存/动态）
```json
{
  "backups": [
    {
      "id": "uuid",
      "filename": "backup_2026-05-25_08-30_full.zip",
      "path": "C:\\...\\backups\\backup_2026-05-25_08-30_full.zip",
      "createdAt": "2026-05-25T08:30:00Z",
      "type": "full",
      "size": 1048576
    }
  ]
}
```

---

## 5. 验收标准

- [ ] 应用独立运行，不依赖 OpenClaw
- [ ] 启动时自动检测 `.openclaw` 目录
- [ ] 备份存储在应用目录下 `{app}/backups/`
- [ ] 支持完整备份、仅配置备份、自定义备份三种模式
- [ ] 自定义模式的文件选择器可勾选文件，状态持久化
- [ ] 「打开文件夹」按钮可定位任意备份文件
- [ ] 备份历史正确显示，可正常恢复
- [ ] REST API 可创建备份、列出备份、恢复备份
- [ ] API 服务可开关，端口可配置
- [ ] 界面美观，符合暗色主题规格
- [ ] 所有操作有适当的用户反馈

---

## 6. 技术栈

- **运行时：** Electron 28+
- **前端：** HTML + CSS + Vanilla JS
- **文件压缩：** archiver
- **HTTP 服务：** Express
- **构建工具：** electron-builder