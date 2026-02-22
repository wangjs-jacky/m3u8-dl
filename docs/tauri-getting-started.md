# Tauri 入门指南：从零开始构建桌面应用

> 本指南基于当前 M3U8 视频下载器项目，帮助你快速掌握 Tauri 开发的核心概念。

## 目录

- [一、什么是 Tauri？](#一什么是-tauri)
- [二、项目文件结构](#二项目文件结构)
- [三、核心配置文件详解](#三核心配置文件详解)
- [四、开发调试方法](#四开发调试方法)
- [五、前后端通信机制](#五前后端通信机制)
- [六、打包发布流程](#六打包发布流程)
- [七、常见问题解答](#七常见问题解答)

---

## 一、什么是 Tauri？

### 1.1 Tauri 简介

**Tauri** 是一个使用 Web 技术构建桌面应用的框架，类似于 Electron，但有以下优势：

| 特性 | Tauri | Electron |
|------|-------|----------|
| **安装包大小** | ~3-10 MB | ~50-150 MB |
| **内存占用** | 低 | 高 |
| **后端语言** | Rust | Node.js |
| **渲染引擎** | 系统原生 WebView | Chromium |
| **安全性** | 高（Rust 内存安全） | 一般 |

### 1.2 技术架构

```
┌─────────────────────────────────────────────────────┐
│                    Tauri 应用                        │
├─────────────────────────────────────────────────────┤
│  前端层 (WebView)                                    │
│  ┌─────────────────────────────────────────────────┐│
│  │  React / Vue / Svelte / 原生 JS                  ││
│  │  ↓                                               ││
│  │  @tauri-apps/api (JavaScript API)               ││
│  └─────────────────────────────────────────────────┘│
│                        ↕ IPC 通信                    │
│  后端层 (Rust)                                       │
│  ┌─────────────────────────────────────────────────┐│
│  │  Tauri Core                                     ││
│  │  ↓                                               ││
│  │  Plugins (Shell, Notification, Store...)        ││
│  │  ↓                                               ││
│  │  Sidecar (外部程序)                              ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 1.3 适用场景

- ✅ 需要小体积安装包
- ✅ 需要调用系统原生 API
- ✅ 需要运行外部程序（Sidecar）
- ✅ 已有 Web 前端，想快速包装成桌面应用

---

## 二、项目文件结构

### 2.1 目录概览

```
apps/desktop/
├── src/                          # 📦 前端代码
│   ├── components/               # React 组件
│   │   ├── AddTaskForm.tsx
│   │   └── TaskList.tsx
│   ├── stores/                   # 状态管理 (Zustand)
│   │   └── downloadStore.ts
│   ├── App.tsx                   # 主组件
│   ├── App.css                   # 样式
│   └── main.tsx                  # 入口文件
│
├── src-tauri/                    # 🦀 Rust 后端
│   ├── src/
│   │   └── main.rs               # Rust 主入口
│   ├── capabilities/
│   │   └── default.json          # 权限配置 ⭐
│   ├── binaries/                 # Sidecar 外部程序
│   │   └── m3u8-server
│   ├── icons/                    # 应用图标
│   ├── Cargo.toml                # Rust 依赖
│   ├── build.rs                  # 构建脚本
│   └── tauri.conf.json           # Tauri 配置 ⭐
│
├── index.html                    # HTML 入口
├── package.json                  # Node 依赖
├── vite.config.ts                # Vite 配置
└── tsconfig.json                 # TypeScript 配置
```

### 2.2 两个关键目录

| 目录 | 作用 | 技术栈 |
|------|------|--------|
| `src/` | 前端 UI 代码 | React + TypeScript + Vite |
| `src-tauri/` | 后端 Rust 代码 + 配置 | Rust + Tauri |

> **注意**: Tauri 只关心 `src-tauri/` 目录，前端可以用任何框架。

---

## 三、核心配置文件详解

### 3.1 tauri.conf.json（最重要）

这是 Tauri 的主配置文件，位于 `src-tauri/tauri.conf.json`：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "M3U8视频下载器",        // 应用名称
  "version": "1.0.0",                     // 版本号
  "identifier": "com.wangjs-jacky.m3u8-downloader",  // 唯一标识

  "build": {
    "beforeBuildCommand": "pnpm build",   // 打包前先构建前端
    "beforeDevCommand": "pnpm dev",       // 开发前先启动前端
    "frontendDist": "../dist",            // 前端构建输出目录
    "devUrl": "http://localhost:5173"     // 开发服务器地址
  },

  "app": {
    "withGlobalTauri": true,              // 全局暴露 Tauri API
    "windows": [{
      "title": "M3U8 视频下载器",
      "width": 800,
      "height": 600,
      "minWidth": 600,
      "minHeight": 400,
      "resizable": true
    }],
    "trayIcon": {                         // 系统托盘配置
      "iconPath": "icons/icon.png"
    }
  },

  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],            // macOS 打包格式
    "externalBin": ["binaries/m3u8-server"],  // Sidecar 外部程序
    "icon": ["icons/32x32.png", "icons/128x128.png", ...]
  }
}
```

**关键配置项说明**:

| 配置项 | 说明 |
|--------|------|
| `identifier` | 应用唯一 ID，格式：`com.公司名.应用名` |
| `beforeDevCommand` | 运行 `tauri dev` 前执行的命令 |
| `beforeBuildCommand` | 运行 `tauri build` 前执行的命令 |
| `externalBin` | Sidecar 外部程序路径（相对于 src-tauri/） |

### 3.2 capabilities/default.json（权限配置）

Tauri v2 引入了细粒度的权限系统，需要在 `capabilities/` 中声明：

```json
{
  "$schema": "https://schema.tauri.app/capability/2",
  "identifier": "default",
  "description": "Default capability for the app",
  "windows": ["main"],
  "permissions": [
    "core:default",                    // 核心功能
    "shell:allow-spawn",               // 允许启动外部进程
    "shell:allow-execute",             // 允许执行命令
    "notification:default",            // 通知权限
    "store:default"                    // 存储权限
  ]
}
```

**常用权限**:

| 权限 | 说明 |
|------|------|
| `core:default` | 基础功能 |
| `shell:allow-spawn` | 启动 Sidecar 必需 |
| `shell:allow-execute` | 执行 Shell 命令 |
| `notification:default` | 系统通知 |
| `store:default` | 本地持久化存储 |
| `dialog:default` | 文件选择对话框 |
| `fs:default` | 文件系统访问 |

### 3.3 Cargo.toml（Rust 依赖）

位于 `src-tauri/Cargo.toml`，类似 `package.json`：

```toml
[package]
name = "m3u8-downloader"
version = "1.0.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"        # Shell 插件
tauri-plugin-notification = "2"  # 通知插件
tauri-plugin-store = "2"         # 存储插件
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## 四、开发调试方法

### 4.1 启动开发服务器

```bash
# 进入项目目录
cd apps/desktop

# 安装依赖（首次）
pnpm install

# 启动开发模式
pnpm tauri:dev
# 或
pnpm tauri dev
```

**执行流程**:
1. 先运行 `beforeDevCommand`（`pnpm dev`）启动 Vite
2. 等待前端开发服务器就绪
3. 编译 Rust 代码并启动应用窗口

### 4.2 热重载

- **前端**: Vite 自动热重载，修改 React 代码即时生效
- **后端**: 修改 Rust 代码需要重新编译（较慢）

### 4.3 调试工具

#### 打开开发者工具

- **macOS**: `Cmd + Option + I`
- **Windows/Linux**: `Ctrl + Shift + I`

或者在代码中打开：

```typescript
// 前端代码中
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

// 打开 DevTools（仅开发模式）
if (import.meta.env.DEV) {
  getCurrentWebviewWindow().openDevTools();
}
```

#### 查看控制台日志

- **前端日志**: 在 DevTools Console 中查看
- **Rust 日志**: 在终端中查看（`println!` 输出）

#### Rust 调试日志

```rust
// main.rs 中使用 println! 或 log crate
println!("Debug info: {:?}", some_value);

// 或使用 log crate（推荐）
use log::info;
info!("Application started");
```

### 4.4 常见调试场景

#### Sidecar 无法启动

```bash
# 1. 检查文件是否存在
ls -la src-tauri/binaries/

# 2. 检查是否有执行权限
chmod +x src-tauri/binaries/m3u8-server

# 3. 检查 tauri.conf.json 中的路径
# externalBin 应该是 ["binaries/m3u8-server"]
```

#### 前端无法调用 Tauri API

```typescript
// 确保已安装依赖
// pnpm add @tauri-apps/api

// 检查是否在 Tauri 环境中运行
import { isTauri } from '@tauri-apps/api/core';
console.log('Is Tauri:', isTauri());
```

---

## 五、前后端通信机制

### 5.1 通信方式对比

| 方式 | 适用场景 | 复杂度 |
|------|----------|--------|
| **Sidecar HTTP** | 已有 Node.js/Python 后端 | 低 |
| **Tauri Commands** | 轻量级 Rust 函数调用 | 中 |
| **Events** | 双向事件通信 | 中 |

### 5.2 本项目的通信架构

```
┌─────────────┐    HTTP API     ┌─────────────┐
│   前端       │ ─────────────→ │   Sidecar   │
│   React     │ ←───────────── │  Node.js    │
└─────────────┘    JSON 数据    └─────────────┘
       ↑                              ↑
       │                              │
       │    Tauri Rust 层启动和管理     │
       └──────────────────────────────┘
```

**前端代码**:

```typescript
// src/stores/downloadStore.ts
const API_BASE = 'http://localhost:15151';  // Sidecar 地址

// 启动下载
const response = await fetch(`${API_BASE}/api/download/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, outputPath, referer }),
});
```

### 5.3 Tauri Commands（另一种方式）

如果你不想用 Sidecar，可以直接调用 Rust 函数：

**Rust 端**:

```rust
// src-tauri/src/main.rs
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])  // 注册命令
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**前端调用**:

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('greet', { name: 'World' });
console.log(result);  // "Hello, World!"
```

---

## 六、打包发布流程

### 6.1 构建生产版本

```bash
# 1. 确保代码无错误
pnpm tauri build

# 这会执行：
# - beforeBuildCommand: pnpm build（构建前端）
# - 编译 Rust 代码（release 模式）
# - 生成安装包
```

### 6.2 输出文件位置

构建完成后，安装包位于：

```
src-tauri/target/release/
├── bundle/
│   ├── dmg/
│   │   └── M3U8视频下载器_1.0.0_aarch64.dmg  # macOS 安装包
│   └── macos/
│       └── M3U8视频下载器.app                 # macOS 应用
└── m3u8-downloader                            # 可执行文件
```

### 6.3 不同平台打包

| 平台 | 打包格式 | 配置项 |
|------|----------|--------|
| **macOS** | `dmg`, `app` | `"targets": ["dmg", "app"]` |
| **Windows** | `msi`, `nsis` | `"targets": ["msi", "nsis"]` |
| **Linux** | `deb`, `AppImage` | `"targets": ["deb", "appimage"]` |

### 6.4 代码签名（可选但推荐）

#### macOS 签名

```bash
# 1. 获取开发者证书（Apple Developer 账号）
# 2. 在 tauri.conf.json 中配置
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (XXXXXX)",
      "providerShortName": "XXXXXX"
    }
  }
}

# 3. 构建
pnpm tauri build
```

### 6.5 自动更新（进阶）

Tauri 支持内置的自动更新功能：

```toml
# Cargo.toml
[dependencies]
tauri-plugin-updater = "2"
```

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://your-domain.com/updates/{{target}}/{{arch}}/{{current_version}}"],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

---

## 七、常见问题解答

### Q1: 修改 Rust 代码后编译太慢怎么办？

**A**: 这是 Rust 的特点。优化方法：
- 使用 `pnpm tauri dev --release` 只在发布时用 release 模式
- 开发时尽量在前端完成逻辑，减少 Rust 修改

### Q2: 如何调试 Sidecar 程序？

**A**: Sidecar 的日志会输出到终端：
```bash
# 查看终端输出，寻找 Sidecar 的 stdout/stderr
pnpm tauri dev
```

### Q3: 打包后应用无法打开？

**A**: 检查以下几点：
1. Sidecar 是否正确打包（检查 `externalBin` 配置）
2. macOS 可能需要：`xattr -cr YourApp.app`
3. 检查控制台错误日志

### Q4: 如何处理跨平台路径？

**A**: 使用 Tauri 的路径 API：

```typescript
import { appDataDir, join } from '@tauri-apps/api/path';

const configPath = await join(await appDataDir(), 'config.json');
```

### Q5: 前端如何访问本地文件？

**A**: 需要在 `capabilities/` 中配置 `fs` 权限：

```json
{
  "permissions": [
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file"
  ]
}
```

---

## 附录：常用命令速查

| 命令 | 说明 |
|------|------|
| `pnpm tauri dev` | 启动开发服务器 |
| `pnpm tauri build` | 构建生产版本 |
| `pnpm tauri info` | 查看环境信息 |
| `pnpm tauri icon` | 生成各尺寸图标 |
| `pnpm tauri signer generate` | 生成更新签名密钥 |

---

## 参考资料

- [Tauri 官方文档](https://v2.tauri.app/)
- [Tauri v2 迁移指南](https://v2.tauri.app/start/migrate/)
- [Tauri 插件市场](https://v2.tauri.app/plugin/)
- [本项目源码](../apps/desktop/)

---

> 最后更新: 2026-02-22
