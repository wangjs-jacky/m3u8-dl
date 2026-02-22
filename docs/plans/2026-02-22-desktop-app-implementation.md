# M3U8 视频下载器桌面应用实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有 M3U8 视频下载器改造为 Tauri 桌面应用，支持批量下载、Chrome 插件集成、系统托盘等功能。

**Architecture:** 使用 Tauri 2.x 作为桌面框架，通过 Sidecar 启动 Node.js 后端服务（端口 15151），React 前端通过 HTTP API 与后端通信，使用 tauri-plugin-store 实现数据持久化。

**Tech Stack:** Tauri 2.x, React 18, TypeScript, Vite, Zustand, Express, tauri-plugin-store, Plasmo

---

## Phase 1: 后端服务扩展

### Task 1.1: 修改默认端口

**Files:**
- Modify: `packages/m3u8-dl/src/server.ts:172`

**Step 1: 修改端口常量**

```typescript
// 修改前
const PORT = process.env.PORT || 5001;

// 修改后
const PORT = process.env.PORT || 15151;
```

**Step 2: 验证修改**

运行: `grep -n "PORT" packages/m3u8-dl/src/server.ts`
预期: 看到 `const PORT = process.env.PORT || 15151;`

**Step 3: Commit**

```bash
git add packages/m3u8-dl/src/server.ts
git commit -m "feat(m3u8-dl): 修改默认端口为 15151"
```

---

### Task 1.2: 添加下载器暂停/继续功能

**Files:**
- Modify: `packages/m3u8-dl/src/downloader.ts`

**Step 1: 先阅读现有代码**

运行: 阅读文件了解 DecryptingDownloader 类的结构
文件: `packages/m3u8-dl/src/downloader.ts`

**Step 2: 添加 paused 属性和 pause/resume 方法**

在 `DecryptingDownloader` 类中添加：

```typescript
export class DecryptingDownloader {
  // 添加到类的属性部分
  private paused = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  // 添加方法
  pause(): void {
    this.paused = true;
    this.pausePromise = new Promise(resolve => {
      this.pauseResolve = resolve;
    });
  }

  resume(): void {
    this.paused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }
  }

  // 添加私有方法用于等待恢复
  private async waitForResume(): Promise<void> {
    if (this.paused && this.pausePromise) {
      await this.pausePromise;
    }
  }
}
```

**Step 3: 在下载循环中添加暂停检查**

找到下载分片的循环部分，在每次下载前添加暂停检查：

```typescript
// 在下载每个分片前添加
await this.waitForResume();
if (this.cancelled) break;
```

**Step 4: Commit**

```bash
git add packages/m3u8-dl/src/downloader.ts
git commit -m "feat(m3u8-dl): 添加下载器暂停/继续功能"
```

---

### Task 1.3: 添加暂停/继续 API 端点

**Files:**
- Modify: `packages/m3u8-dl/src/server.ts`
- Modify: `packages/m3u8-dl/src/types.ts`

**Step 1: 更新类型定义**

在 `packages/m3u8-dl/src/types.ts` 中更新 status 类型：

```typescript
export type DownloadStatus =
  | 'pending'
  | 'downloading_key'
  | 'downloading'
  | 'paused'
  | 'merging'
  | 'completed'
  | 'error'
  | 'cancelled';
```

**Step 2: 添加暂停端点**

在 `server.ts` 中，在 `cancel` 端点后添加：

```typescript
/**
 * 暂停下载
 */
app.post('/api/download/:id/pause', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  if (downloaders[id]) {
    downloaders[id].pause();
  }

  downloads[id].status = 'paused';
  downloads[id].message = '已暂停';

  res.json({ status: 'paused' });
});

/**
 * 继续下载
 */
app.post('/api/download/:id/resume', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  if (downloaders[id]) {
    downloaders[id].resume();
  }

  downloads[id].status = 'downloading';
  downloads[id].message = '继续下载中...';

  res.json({ status: 'resumed' });
});
```

**Step 3: 编译验证**

运行: `cd packages/m3u8-dl && npm run build`
预期: 编译成功无错误

**Step 4: Commit**

```bash
git add packages/m3u8-dl/src/server.ts packages/m3u8-dl/src/types.ts
git commit -m "feat(m3u8-dl): 添加暂停/继续 API 端点"
```

---

### Task 1.4: 添加清除任务 API 端点

**Files:**
- Modify: `packages/m3u8-dl/src/server.ts`

**Step 1: 添加清除端点**

在 `/api/downloads` 端点后添加：

```typescript
/**
 * 清除已完成/失败的任务
 */
app.delete('/api/downloads/clear', (_req, res) => {
  const clearableStatuses = ['completed', 'error', 'cancelled'];

  for (const id of Object.keys(downloads)) {
    if (clearableStatuses.includes(downloads[id].status)) {
      delete downloads[id];
      delete downloaders[id];
    }
  }

  res.json({ status: 'cleared' });
});
```

**Step 2: Commit**

```bash
git add packages/m3u8-dl/src/server.ts
git commit -m "feat(m3u8-dl): 添加清除任务 API 端点"
```

---

## Phase 2: Chrome 插件改进

### Task 2.1: 修改 API 地址和下载函数

**Files:**
- Modify: `packages/video-sniffer/src/popup.tsx`

**Step 1: 修改 API_BASE 和 download 函数**

找到现有的 `download` 函数（约第 54 行），替换为：

```typescript
const API_BASE = 'http://localhost:15151'

const showToast = (message: string) => {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
}

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
      const error = await response.json()
      showToast(`添加失败: ${error.error || '未知错误'}`)
    }
  } catch (error) {
    showToast('无法连接到桌面应用，请确保已启动')
  }
}
```

**Step 2: Commit**

```bash
git add packages/video-sniffer/src/popup.tsx
git commit -m "feat(video-sniffer): 修改下载函数为直接调用 API"
```

---

### Task 2.2: 添加批量下载功能

**Files:**
- Modify: `packages/video-sniffer/src/popup.tsx`
- Modify: `packages/video-sniffer/src/popup.css`

**Step 1: 添加选中状态管理**

在 `IndexPopup` 组件中添加：

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

const toggleSelect = (id: string) => {
  const newSelected = new Set(selectedIds)
  if (newSelected.has(id)) {
    newSelected.delete(id)
  } else {
    newSelected.add(id)
  }
  setSelectedIds(newSelected)
}

const generateFilename = (video: VideoItem) => {
  const timestamp = new Date(video.timestamp).toISOString().slice(0, 10)
  return `video_${timestamp}_${video.id.slice(0, 6)}`
}

const downloadSelected = async () => {
  const selectedVideos = filteredVideos.filter(v => selectedIds.has(v.id))
  for (const video of selectedVideos) {
    await download(video.url, generateFilename(video))
  }
  setSelectedIds(new Set())
}
```

**Step 2: 修改 UI 添加复选框和批量按钮**

修改 `video-item` 的渲染部分：

```tsx
<div key={v.id} className="video-item">
  <div className="video-header">
    <input
      type="checkbox"
      checked={selectedIds.has(v.id)}
      onChange={() => toggleSelect(v.id)}
      className="checkbox"
    />
    <span className={`type-badge ${v.type}`}>{v.type.toUpperCase()}</span>
    {/* ... 其余内容 */}
  </div>
  {/* ... */}
</div>
```

在 `toolbar` 中添加批量下载按钮：

```tsx
<div className="toolbar">
  <select value={filter} onChange={(e) => setFilter(e.target.value as FilterType)}>
    {/* ... */}
  </select>
  <button
    className="btn-batch"
    onClick={downloadSelected}
    disabled={selectedIds.size === 0}
  >
    下载选中 ({selectedIds.size})
  </button>
  <button className="btn-clear" onClick={clearAll}>清空</button>
</div>
```

**Step 3: 添加 CSS 样式**

在 `popup.css` 中添加：

```css
.checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.btn-batch {
  padding: 6px 12px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-batch:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 1000;
  animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
  0%, 100% { opacity: 0; }
  20%, 80% { opacity: 1; }
}
```

**Step 4: Commit**

```bash
git add packages/video-sniffer/src/popup.tsx packages/video-sniffer/src/popup.css
git commit -m "feat(video-sniffer): 添加批量下载功能"
```

---

## Phase 3: Tauri 桌面应用搭建

### Task 3.1: 创建项目目录结构

**Files:**
- Create: `apps/desktop/`

**Step 1: 创建目录**

```bash
mkdir -p apps/desktop/src/components
mkdir -p apps/desktop/src/stores
mkdir -p apps/desktop/src-tauri/src
mkdir -p apps/desktop/src-tauri/icons
```

**Step 2: Commit**

```bash
git add apps/
git commit -m "chore(desktop): 创建项目目录结构"
```

---

### Task 3.2: 初始化 package.json

**Files:**
- Create: `apps/desktop/package.json`

**Step 1: 创建 package.json**

```json
{
  "name": "@wangjs-jacky/m3u8-downloader-desktop",
  "version": "1.0.0",
  "description": "M3U8 视频下载器桌面应用",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-notification": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "@tauri-apps/plugin-store": "^2.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

**Step 2: Commit**

```bash
git add apps/desktop/package.json
git commit -m "chore(desktop): 添加 package.json"
```

---

### Task 3.3: 创建 Vite 配置

**Files:**
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/index.html`

**Step 1: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
```

**Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 3: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 4: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>M3U8 视频下载器</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Commit**

```bash
git add apps/desktop/
git commit -m "chore(desktop): 添加 Vite 和 TypeScript 配置"
```

---

### Task 3.4: 创建 Tauri Cargo.toml

**Files:**
- Create: `apps/desktop/src-tauri/Cargo.toml`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "m3u8-downloader"
version = "1.0.0"
description = "M3U8 Video Downloader"
authors = ["wangjs-jacky"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tauri-plugin-notification = "2"
tauri-plugin-store = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

**Step 2: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml
git commit -m "chore(desktop): 添加 Cargo.toml"
```

---

### Task 3.5: 创建 Tauri 配置文件

**Files:**
- Create: `apps/desktop/src-tauri/tauri.conf.json`

**Step 1: 创建 tauri.conf.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "M3U8视频下载器",
  "version": "1.0.0",
  "identifier": "com.wangjs-jacky.m3u8-downloader",
  "build": {
    "beforeBuildCommand": "pnpm build",
    "beforeDevCommand": "pnpm dev",
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "M3U8 视频下载器",
        "width": 800,
        "height": 600,
        "minWidth": 600,
        "minHeight": 400,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    },
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "externalBin": ["binaries/m3u8-server"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "shell": {
      "sidecar": true,
      "open": true
    },
    "notification": {
      "all": true
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json
git commit -m "chore(desktop): 添加 Tauri 配置文件"
```

---

### Task 3.6: 创建 Rust 主入口

**Files:**
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`

**Step 1: 创建 build.rs**

```rust
fn main() {
    tauri_build::build()
}
```

**Step 2: 创建 main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WebviewWindow,
};
use tauri_plugin_shell::ShellExt;

static QUIT_FLAG: AtomicBool = AtomicBool::new(false);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // 启动 Sidecar
            let shell = app.shell();
            let sidecar_command = shell
                .sidecar("m3u8-server")
                .expect("failed to create sidecar command");
            let (mut _rx, _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");

            // 创建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "quit" => {
                        QUIT_FLAG.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 点击关闭按钮时最小化到托盘
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !QUIT_FLAG.load(Ordering::SeqCst) {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Commit**

```bash
git add apps/desktop/src-tauri/
git commit -m "feat(desktop): 添加 Rust 主入口（Sidecar + 托盘）"
```

---

## Phase 4: React 前端开发

### Task 4.1: 创建 React 入口文件

**Files:**
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/App.css`

**Step 1: 创建 main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 2: 创建 App.tsx 基础结构**

```tsx
import { useDownloadStore } from './stores/downloadStore'
import { TaskList } from './components/TaskList'
import { AddTaskForm } from './components/AddTaskForm'

function App() {
  const { fetchTasks } = useDownloadStore()

  // 启动时获取任务列表
  React.useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 1000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  return (
    <div className="app">
      <header className="header">
        <h1>M3U8 视频下载器</h1>
      </header>
      <main className="main">
        <AddTaskForm />
        <TaskList />
      </main>
    </div>
  )
}

export default App
```

**Step 3: 创建基础样式 App.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #eee;
}

.app {
  min-height: 100vh;
  padding: 20px;
}

.header {
  text-align: center;
  padding: 20px 0;
  border-bottom: 1px solid #333;
  margin-bottom: 20px;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
}

.main {
  max-width: 900px;
  margin: 0 auto;
}
```

**Step 4: Commit**

```bash
git add apps/desktop/src/
git commit -m "feat(desktop): 添加 React 入口文件和基础结构"
```

---

### Task 4.2: 创建状态管理 Store

**Files:**
- Create: `apps/desktop/src/stores/downloadStore.ts`

**Step 1: 创建 downloadStore.ts**

```typescript
import { create } from 'zustand'

const API_BASE = 'http://localhost:15151'

export type DownloadStatus =
  | 'pending'
  | 'downloading_key'
  | 'downloading'
  | 'paused'
  | 'merging'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface DownloadTask {
  id: string
  url: string
  outputPath: string
  progress: number
  status: DownloadStatus
  message: string
  error?: string
  createdAt: string
  timestamp: string
}

interface DownloadStore {
  tasks: DownloadTask[]
  isLoading: boolean

  fetchTasks: () => Promise<void>
  startDownload: (url: string, outputPath: string, referer?: string) => Promise<void>
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: [],
  isLoading: false,

  fetchTasks: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/downloads`)
      if (response.ok) {
        const tasks: DownloadTask[] = await response.json()
        set({ tasks })
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    }
  },

  startDownload: async (url, outputPath, referer) => {
    set({ isLoading: true })
    try {
      const response = await fetch(`${API_BASE}/api/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          output_path: outputPath,
          referer: referer || '',
        }),
      })
      if (response.ok) {
        await get().fetchTasks()
      } else {
        const error = await response.json()
        throw new Error(error.error || '启动下载失败')
      }
    } finally {
      set({ isLoading: false })
    }
  },

  pauseTask: async (id) => {
    await fetch(`${API_BASE}/api/download/${id}/pause`, { method: 'POST' })
    await get().fetchTasks()
  },

  resumeTask: async (id) => {
    await fetch(`${API_BASE}/api/download/${id}/resume`, { method: 'POST' })
    await get().fetchTasks()
  },

  cancelTask: async (id) => {
    await fetch(`${API_BASE}/api/download/${id}/cancel`, { method: 'POST' })
    await get().fetchTasks()
  },

  clearCompleted: async () => {
    await fetch(`${API_BASE}/api/downloads/clear`, { method: 'DELETE' })
    await get().fetchTasks()
  },
}))
```

**Step 2: Commit**

```bash
git add apps/desktop/src/stores/downloadStore.ts
git commit -m "feat(desktop): 添加下载状态管理 Store"
```

---

### Task 4.3: 创建添加任务表单组件

**Files:**
- Create: `apps/desktop/src/components/AddTaskForm.tsx`

**Step 1: 创建 AddTaskForm.tsx**

```tsx
import { useState } from 'react'
import { useDownloadStore } from '../stores/downloadStore'

export function AddTaskForm() {
  const { startDownload, isLoading } = useDownloadStore()
  const [url, setUrl] = useState('')
  const [outputPath, setOutputPath] = useState('~/Downloads/videos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [referer, setReferer] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    const filename = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fullPath = `${outputPath}/${filename}.mp4`

    await startDownload(url.trim(), fullPath, referer.trim() || undefined)
    setUrl('')
  }

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText()
    setUrl(text)
  }

  return (
    <div className="add-task-form">
      <h2>添加下载任务</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>M3U8 链接</label>
          <div className="input-row">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴 m3u8 视频链接..."
              disabled={isLoading}
            />
            <button type="button" onClick={handlePaste} className="btn-paste">
              粘贴
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>保存位置</label>
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            placeholder="~/Downloads/videos"
            disabled={isLoading}
          />
        </div>

        <div className="advanced-toggle">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="btn-toggle"
          >
            {showAdvanced ? '▼' : '▶'} 高级选项
          </button>
        </div>

        {showAdvanced && (
          <div className="form-group">
            <label>Referer (可选)</label>
            <input
              type="text"
              value={referer}
              onChange={(e) => setReferer(e.target.value)}
              placeholder="视频来源页面 URL"
              disabled={isLoading}
            />
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? '添加中...' : '添加到队列'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

**Step 2: 添加组件样式到 App.css**

```css
/* AddTaskForm 样式 */
.add-task-form {
  background: #16213e;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.add-task-form h2 {
  font-size: 16px;
  margin-bottom: 16px;
  color: #4cc9f0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: #aaa;
  margin-bottom: 6px;
}

.input-row {
  display: flex;
  gap: 8px;
}

.input-row input {
  flex: 1;
}

input[type="text"] {
  width: 100%;
  padding: 10px 12px;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 6px;
  color: #eee;
  font-size: 14px;
}

input[type="text"]:focus {
  outline: none;
  border-color: #4cc9f0;
}

input[type="text"]:disabled {
  opacity: 0.6;
}

.btn-paste {
  padding: 10px 16px;
  background: #333;
  color: #eee;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-paste:hover {
  background: #444;
}

.advanced-toggle {
  margin-bottom: 16px;
}

.btn-toggle {
  background: none;
  border: none;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}

.btn-toggle:hover {
  color: #aaa;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-primary {
  padding: 12px 24px;
  background: #4cc9f0;
  color: #1a1a2e;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
  background: #3aa8d8;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 3: Commit**

```bash
git add apps/desktop/src/components/AddTaskForm.tsx apps/desktop/src/App.css
git commit -m "feat(desktop): 添加任务表单组件"
```

---

### Task 4.4: 创建任务列表组件

**Files:**
- Create: `apps/desktop/src/components/TaskList.tsx`
- Create: `apps/desktop/src/components/TaskItem.tsx`

**Step 1: 创建 TaskItem.tsx**

```tsx
import { DownloadTask, useDownloadStore } from '../stores/downloadStore'

interface TaskItemProps {
  task: DownloadTask
}

export function TaskItem({ task }: TaskItemProps) {
  const { pauseTask, resumeTask, cancelTask } = useDownloadStore()

  const getStatusText = () => {
    switch (task.status) {
      case 'pending': return '准备中...'
      case 'downloading_key': return '下载密钥中...'
      case 'downloading': return task.message || '下载中...'
      case 'paused': return '已暂停'
      case 'merging': return '合并视频中...'
      case 'completed': return '已完成'
      case 'error': return `错误: ${task.error || '未知错误'}`
      case 'cancelled': return '已取消'
      default: return task.message
    }
  }

  const getStatusClass = () => {
    switch (task.status) {
      case 'completed': return 'status-success'
      case 'error': return 'status-error'
      case 'paused': return 'status-warning'
      case 'cancelled': return 'status-warning'
      default: return 'status-downloading'
    }
  }

  const isActive = ['downloading', 'downloading_key', 'merging', 'pending'].includes(task.status)
  const isPaused = task.status === 'paused'
  const isCompleted = task.status === 'completed'

  const filename = task.outputPath.split('/').pop() || task.outputPath

  return (
    <div className={`task-item ${getStatusClass()}`}>
      <div className="task-header">
        <span className="task-filename">{filename}</span>
        <div className="task-actions">
          {isActive && (
            <button onClick={() => pauseTask(task.id)} className="btn-action">
              ⏸
            </button>
          )}
          {isPaused && (
            <button onClick={() => resumeTask(task.id)} className="btn-action">
              ▶️
            </button>
          )}
          {!isCompleted && (
            <button onClick={() => cancelTask(task.id)} className="btn-action">
              ❌
            </button>
          )}
          {isCompleted && (
            <button
              onClick={() => {/* TODO: 打开文件夹 */}}
              className="btn-action"
            >
              📂
            </button>
          )}
        </div>
      </div>

      <div className="task-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <span className="progress-text">{task.progress.toFixed(0)}%</span>
      </div>

      <div className="task-status">{getStatusText()}</div>
    </div>
  )
}
```

**Step 2: 创建 TaskList.tsx**

```tsx
import { useDownloadStore } from '../stores/downloadStore'
import { TaskItem } from './TaskItem'

export function TaskList() {
  const { tasks, clearCompleted } = useDownloadStore()

  const activeCount = tasks.filter(t =>
    ['pending', 'downloading', 'downloading_key', 'merging', 'paused'].includes(t.status)
  ).length

  const completedCount = tasks.filter(t =>
    ['completed', 'error', 'cancelled'].includes(t.status)
  ).length

  if (tasks.length === 0) {
    return (
      <div className="task-list empty">
        <p>暂无下载任务</p>
        <p className="hint">添加 M3U8 链接开始下载</p>
      </div>
    )
  }

  return (
    <div className="task-list">
      <div className="task-list-header">
        <span>下载任务 ({activeCount} 个进行中 / {tasks.length} 个总计)</span>
        {completedCount > 0 && (
          <button onClick={clearCompleted} className="btn-clear">
            清除已完成
          </button>
        )}
      </div>

      <div className="task-items">
        {tasks.map(task => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}
```

**Step 3: 添加任务列表样式到 App.css**

```css
/* TaskList 样式 */
.task-list {
  background: #16213e;
  border-radius: 12px;
  padding: 20px;
}

.task-list.empty {
  text-align: center;
  padding: 40px 20px;
  color: #888;
}

.task-list.empty .hint {
  font-size: 13px;
  margin-top: 8px;
}

.task-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
  color: #aaa;
}

.btn-clear {
  background: none;
  border: 1px solid #444;
  color: #888;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-clear:hover {
  border-color: #666;
  color: #aaa;
}

.task-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* TaskItem 样式 */
.task-item {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
  border-left: 3px solid #4cc9f0;
}

.task-item.status-success {
  border-left-color: #4CAF50;
}

.task-item.status-error {
  border-left-color: #f44336;
}

.task-item.status-warning {
  border-left-color: #ff9800;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-filename {
  font-size: 14px;
  font-weight: 500;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  opacity: 0.7;
}

.btn-action:hover {
  opacity: 1;
}

.task-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #333;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4cc9f0, #4361ee);
  transition: width 0.3s ease;
}

.status-success .progress-fill {
  background: #4CAF50;
}

.status-error .progress-fill {
  background: #f44336;
}

.progress-text {
  font-size: 12px;
  color: #888;
  min-width: 40px;
  text-align: right;
}

.task-status {
  font-size: 12px;
  color: #888;
}
```

**Step 4: Commit**

```bash
git add apps/desktop/src/components/TaskList.tsx apps/desktop/src/components/TaskItem.tsx apps/desktop/src/App.css
git commit -m "feat(desktop): 添加任务列表组件"
```

---

## Phase 5: Sidecar 打包配置

### Task 5.1: 配置 Sidecar 二进制文件

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`

**Step 1: 创建 capabilities 配置**

```bash
mkdir -p apps/desktop/src-tauri/capabilities
```

创建 `apps/desktop/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "https://schema.tauri.app/capability/2",
  "identifier": "default",
  "description": "Default capability for the app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-spawn",
    "shell:allow-execute",
    "shell:allow-sidecar",
    "notification:default",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify",
    "store:default",
    "store:allow-get",
    "store:allow-set",
    "store:allow-save",
    "store:allow-load"
  ]
}
```

**Step 2: 更新 tauri.conf.json 的 externalBin 配置**

```json
{
  "bundle": {
    "externalBin": [
      "binaries/m3u8-server"
    ]
  }
}
```

**Step 3: 创建 Sidecar 打包脚本**

创建 `apps/desktop/scripts/build-sidecar.sh`:

```bash
#!/bin/bash

# 构建 m3u8-dl 并打包为 Sidecar
cd ../../../packages/m3u8-dl
npm run build

# 创建 sidecar 目录
mkdir -p ../apps/desktop/src-tauri/binaries

# 复制编译后的文件
cp -r dist ../apps/desktop/src-tauri/binaries/m3u8-server-dist

# 创建启动脚本
cat > ../apps/desktop/src-tauri/binaries/m3u8-server << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/m3u8-server-dist/server.js"
EOF

chmod +x ../apps/desktop/src-tauri/binaries/m3u8-server
```

**Step 4: Commit**

```bash
git add apps/desktop/
git commit -m "feat(desktop): 配置 Sidecar 和权限"
```

---

## Phase 6: 更新 Monorepo 配置

### Task 6.1: 更新根 package.json

**Files:**
- Modify: `package.json`

**Step 1: 添加 desktop 相关脚本**

```json
{
  "scripts": {
    "build": "npm run build -w packages/m3u8-dl",
    "dev": "npm run dev -w packages/m3u8-dl",
    "server": "npm run server -w packages/m3u8-dl",
    "sniffer:dev": "npm run dev -w @wangjs-jacky/video-sniffer",
    "sniffer:build": "npm run build -w @wangjs-jacky/video-sniffer",
    "desktop:dev": "npm run tauri:dev -w @wangjs-jacky/m3u8-downloader-desktop",
    "desktop:build": "npm run tauri:build -w @wangjs-jacky/m3u8-downloader-desktop"
  },
  "workspaces": [
    "packages/*",
    "apps/*"
  ]
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: 更新根 package.json 添加 desktop 脚本"
```

---

## 总结

### 任务概览

| Phase | 任务数 | 描述 |
|-------|--------|------|
| Phase 1 | 4 | 后端服务扩展（端口、暂停/继续、清除） |
| Phase 2 | 2 | Chrome 插件改进（API、批量下载） |
| Phase 3 | 6 | Tauri 桌面应用搭建 |
| Phase 4 | 4 | React 前端开发 |
| Phase 5 | 1 | Sidecar 打包配置 |
| Phase 6 | 1 | Monorepo 配置更新 |

**总计: 18 个任务**

### 验证清单

- [ ] 后端服务在 15151 端口正常运行
- [ ] 暂停/继续 API 工作正常
- [ ] Chrome 插件可以直接发送到桌面应用
- [ ] Tauri 应用可以正常启动
- [ ] Sidecar 可以正常启动后端服务
- [ ] 任务列表可以实时更新
- [ ] 系统托盘功能正常
