# M3U8 视频下载器 - 桌面应用设计

> 创建日期: 2026-02-22

## 概述

将现有的 M3U8 视频下载器改造为 Tauri 桌面应用，支持批量下载、Chrome 插件集成、系统托盘等功能。

## 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2.x | 轻量级，打包约 10MB |
| 前端 | React + TypeScript + Vite | 复用现有技术栈 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 后端服务 | Express (Node.js Sidecar) | 复用现有代码 |
| 数据存储 | tauri-plugin-store | 官方 JSON 存储插件 |
| Chrome 插件 | Plasmo | 复用现有代码 |

## 整体架构

```
video-downloader/
├── packages/
│   ├── m3u8-dl/              # 现有下载服务（少量改动）
│   │   ├── src/
│   │   │   ├── server.ts     # Express API（添加暂停/继续/新端口）
│   │   │   ├── downloader.ts # 添加 pause/resume 方法
│   │   │   └── ...
│   │   └── package.json
│   │
│   └── video-sniffer/        # Chrome 插件（小改动）
│       ├── src/
│       │   ├── popup.tsx     # 改为调用桌面应用 API
│       │   └── background.ts
│       └── ...
│
├── apps/
│   └── desktop/              # 新建：Tauri 桌面应用
│       ├── src/              # React 前端
│       │   ├── App.tsx       # 主界面（任务列表）
│       │   ├── components/
│       │   │   ├── TaskList.tsx
│       │   │   ├── TaskItem.tsx
│       │   │   ├── AddTaskForm.tsx
│       │   │   └── Settings.tsx
│       │   └── stores/       # 状态管理
│       │       └── downloadStore.ts
│       │
│       ├── src-tauri/        # Tauri Rust 后端
│       │   ├── src/
│       │   │   ├── main.rs   # 启动 sidecar、托盘、通知
│       │   │   ├── sidecar.rs
│       │   │   └── tray.rs
│       │   ├── tauri.conf.json
│       │   └── Cargo.toml
│       │
│       └── package.json
│
└── package.json              # monorepo 根配置
```

## 端口配置

所有组件统一使用 **15151** 端口（不常用高位端口）。

| 场景 | 端口 |
|------|------|
| Tauri 开发模式 | 环境变量传入（或默认 15151） |
| Tauri 生产模式 | 固定 15151 |
| Chrome 插件 | 固定请求 localhost:15151 |

## 前端界面设计

```
┌─────────────────────────────────────────────────────────────┐
│  🎬 M3U8 视频下载器                          [─] [□] [×]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📥 添加下载任务                                      │   │
│  │                                                       │   │
│  │ M3U8 链接                                            │   │
│  │ [https://example.com/video.m3u8              ] [粘贴] │   │
│  │                                                       │   │
│  │ 保存位置                                    [选择]   │   │
│  │ [~/Downloads/videos/                              ]   │   │
│  │                                                       │   │
│  │ [展开更多选项 ▼]                                     │   │
│  │                                                       │   │
│  │                              [添加到队列] [立即下载]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 下载任务 (3 个进行中 / 8 个总计)     [全部暂停] [设置]│   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                       │   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ 📹 video1.mp4                    [⏸] [❌] [📂]  │ │   │
│  │ │ ████████████████████░░░░░░░░  67%  |  下载中    │ │   │
│  │ │ 45/67 分片 | 速度: 2.3 MB/s | 剩余: ~30s       │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  │                                                       │   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ 📹 video2.mp4                    [▶️] [❌] [📂]  │ │   │
│  │ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  等待中           │ │   │
│  │ │ 等待空闲槽位 (当前并发数: 3)                    │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  │                                                       │   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ ✅ video3.mp4                    [🗑️] [📂]      │ │   │
│  │ │ 已完成 | 2024-02-22 14:30 | 256 MB             │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  │                                                       │   │
│  │ [显示已完成任务 ▼]                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**核心功能**：
- 顶部：添加任务表单（可折叠高级选项）
- 中部：任务列表，实时状态更新
- 每个任务：进度条、状态、操作按钮（暂停/继续/取消/打开文件夹）
- 底部：已完成的任务可折叠

## 后端 API 设计

### 现有 API（保持不变）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/download/start` | POST | 启动下载 |
| `/api/download/:id/status` | GET | 获取单个任务状态 |
| `/api/download/:id/cancel` | POST | 取消下载 |
| `/api/downloads` | GET | 列出所有任务 |

### 新增 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/download/:id/pause` | POST | 暂停下载 |
| `/api/download/:id/resume` | POST | 继续下载 |
| `/api/downloads/clear` | DELETE | 清除已完成/失败任务 |
| `/api/config` | GET/PUT | 获取/保存设置 |

### 改动点

**server.ts 添加暂停/继续支持**：

```typescript
// 暂停下载
app.post('/api/download/:id/pause', (req, res) => {
  const { id } = req.params;
  if (downloaders[id]) {
    downloaders[id].pause();
    downloads[id].status = 'paused';
  }
  res.json({ status: 'paused' });
});

// 继续下载
app.post('/api/download/:id/resume', (req, res) => {
  const { id } = req.params;
  if (downloaders[id]) {
    downloaders[id].resume();
    downloads[id].status = 'downloading';
  }
  res.json({ status: 'resumed' });
});
```

**downloader.ts 添加 pause/resume 方法**：

```typescript
class DecryptingDownloader {
  private paused = false;

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  // 下载循环中检查 paused 状态
}
```

## Chrome 插件改进

### 改动点

**1. popup.tsx - 修改下载函数**

```typescript
// 修改前
const download = (url: string) => {
  const downloaderUrl = `http://localhost:5001/?url=${encodeURIComponent(url)}`
  chrome.tabs.create({ url: downloaderUrl })
}

// 修改后：直接调用 API，不打开新标签页
const API_BASE = 'http://localhost:15151'

const download = async (url: string, filename?: string) => {
  try {
    const response = await fetch(`${API_BASE}/api/download/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        output_path: `~/Downloads/${filename || 'video'}.mp4`
      })
    })

    if (response.ok) {
      showToast('已添加到下载队列')
    } else {
      showToast('添加失败，请确保桌面应用已启动')
    }
  } catch (error) {
    showToast('无法连接到桌面应用')
  }
}
```

**2. popup.tsx - 添加批量下载按钮**

```tsx
// 批量下载选中项
const downloadSelected = async () => {
  for (const video of selectedVideos) {
    await download(video.url, generateFilename(video))
  }
  setSelectedVideos([])
}

// UI 添加复选框和批量按钮
<div className="toolbar">
  <button onClick={downloadSelected} disabled={selectedVideos.length === 0}>
    下载选中 ({selectedVideos.length})
  </button>
</div>
```

## Tauri 桌面应用核心

### 启动流程

```
┌──────────────────────────────────────────────────────────┐
│                    应用启动流程                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Tauri 应用启动                                        │
│       │                                                  │
│       ▼                                                  │
│  2. Rust 层启动 Node.js Sidecar                          │
│       │                                                  │
│       │  ┌─────────────────────────────┐                 │
│       └──►  node packages/m3u8-dl/dist/server.js         │
│           (监听 15151 端口)              │                 │
│       ◄─────────────────────────────┘                    │
│       │                                                  │
│       ▼                                                  │
│  3. React 前端加载，连接 localhost:15151                  │
│       │                                                  │
│       ▼                                                  │
│  4. 创建系统托盘图标                                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Tauri 配置 (tauri.conf.json)

```json
{
  "build": {
    "beforeBuildCommand": "pnpm build",
    "beforeDevCommand": "pnpm dev",
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.wangjs-jacky.m3u8-downloader",
      "targets": ["dmg", "app"],
      "externalBin": ["binaries/m3u8-server"]
    },
    "systemTray": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    },
    "allowlist": {
      "notification": { "all": true },
      "shell": { "sidecar": true, "open": true }
    }
  }
}
```

### Rust 核心代码

```rust
fn main() {
    tauri::Builder::default()
        .system_tray(SystemTray::new())
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
            }
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "quit" => std::process::exit(0),
                    _ => {}
                }
            }
            _ => {}
        })
        .setup(|app| {
            let sidecar = Command::new_sidecar("m3u8-server")
                .expect("failed to create sidecar");

            let (mut rx, _child) = sidecar.spawn().expect("Failed to spawn sidecar");

            app.manage(SidecarHandle(Arc::new(Mutex::new(Some(_child)))));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 窗口行为

- **关闭按钮** → 最小化到托盘（不退出）
- **托盘点击** → 显示窗口
- **托盘菜单** → 显示窗口 / 退出
- **Cmd+Q / 退出** → 真正退出，停止 Sidecar

## 数据存储设计

### 存储方案

使用 **tauri-plugin-store**（官方插件，基于 JSON 文件）

### 数据结构

```typescript
// 存储文件: ~/.m3u8-downloader/store.json

interface AppStore {
  // 用户设置
  settings: {
    defaultSavePath: string      // 默认保存路径: "~/Downloads/videos"
    maxConcurrent: number        // 最大并发数: 3
    autoStartDownload: boolean   // 添加后自动开始: true
    showNotification: boolean    // 下载完成通知: true
    minimizeToTray: boolean      // 关闭最小化到托盘: true
  }

  // 下载历史（最近 100 条）
  history: HistoryItem[]
}

interface HistoryItem {
  id: string
  url: string
  filename: string
  outputPath: string
  status: 'completed' | 'cancelled' | 'error'
  fileSize: number           // 字节
  duration: number           // 下载耗时（秒）
  completedAt: string        // ISO 时间戳
}
```

### Tauri Store 配置

```rust
use tauri_plugin_store::StoreBuilder;

fn setup_store(app: &AppHandle) -> Store<Wry> {
    let mut store = StoreBuilder::new(app, "store.json")
        .build()
        .unwrap();

    if !store.has("settings") {
        store.set("settings", json!({
            "defaultSavePath": "~/Downloads/videos",
            "maxConcurrent": 3,
            "autoStartDownload": true,
            "showNotification": true,
            "minimizeToTray": true
        }));
    }

    if !store.has("history") {
        store.set("history", json!([]));
    }

    store.save().unwrap();
    store
}
```

### 前端调用示例

```typescript
import { Store } from '@tauri-apps/plugin-store'

const store = await Store.load('store.json')

// 读取设置
const settings = await store.get('settings')

// 保存设置
await store.set('settings', { ...settings, maxConcurrent: 5 })
await store.save()

// 添加历史记录
const history = await store.get<HistoryItem[]>('history') || []
history.unshift(newHistoryItem)
await store.set('history', history.slice(0, 100))
await store.save()
```

## 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 批量下载 + 并发控制 | 新增 | 同时下载多个视频，可设置并发数 |
| 任务暂停/继续 | 新增 | 支持暂停和恢复下载 |
| Chrome 插件直接发送 | 改进 | 无需打开浏览器页面，直接发送到桌面应用 |
| 下载历史记录 | 新增 | 保存最近 100 条下载记录 |
| 设置持久化 | 新增 | 保存用户偏好设置 |
| 系统托盘 | 新增 | 最小化到托盘，后台继续下载 |
| 下载完成通知 | 新增 | 系统级通知提醒 |
