# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 M3U8 视频下载器，采用 Monorepo 架构：

```
video-downloader/
├── apps/
│   └── desktop/          # Tauri 桌面应用（主要产品）
├── packages/
│   ├── m3u8-dl/          # 核心下载库（CLI + API Server）
│   └── video-sniffer/    # 浏览器插件（Chrome）
└── frontend/             # [待清理] 旧的 Web 前端
```

## 架构说明

### Tauri 桌面应用 (apps/desktop/)

**技术栈**: Tauri v2 + React + TypeScript + Vite + Zustand

**核心机制**:
- 使用 Sidecar 运行 `m3u8-server`（来自 `@wangjs-jacky/m3u8-dl`）
- 后端服务运行在 `localhost:15151`
- 支持系统托盘（最小化到托盘）
- 支持 Deep Link（`m3u8-downloader://`）

**启动命令**:
```bash
cd apps/desktop
npm run tauri:dev      # 开发模式
npm run tauri:build    # 构建生产版本
```

### 核心下载库 (packages/m3u8-dl/)

**技术栈**: Node.js + TypeScript + Express + FFmpeg

**功能**:
- M3U8 解析和下载
- AES-128 解密支持
- API Server（供桌面应用和浏览器插件调用）
- CLI 工具

**命令**:
```bash
cd packages/m3u8-dl
npm run dev        # 开发模式
npm run build      # 编译
npm run server     # 启动 API Server
```

**API 端点**:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/download/start` | POST | 启动下载任务 |
| `/api/download/<id>/status` | GET | 获取下载状态 |
| `/api/download/<id>/cancel` | POST | 取消下载 |
| `/api/downloads` | GET | 列出所有下载任务 |

### 浏览器插件 (packages/video-sniffer/)

**技术栈**: Plasmo + React + TypeScript

**功能**:
- 自动嗅探页面中的 M3U8/MP4 视频资源
- 显示嗅探到的视频列表
- 支持一键下载到桌面应用
- 通过 Deep Link 唤起桌面应用

**构建命令**:
```bash
cd packages/video-sniffer
npm run build      # 构建插件
```

## 开发规范

### Skills 要求

**强制要求**: 涉及 Tauri 相关代码时，必须先调用 `/tauri-v2` skill 获取最新指导。

### Tauri 应用开发规范

**强制要求**: 每次修改 Tauri 应用代码（`apps/desktop/src-tauri/`）后，必须确保 Rust 编译通过：

```bash
cd apps/desktop/src-tauri && cargo check
```

在回复用户之前，必须验证编译成功。如果编译失败，需要修复所有错误后再回复。

### 通信机制

1. **浏览器插件 → 桌面应用**:
   - 优先: API (`http://localhost:15151`)
   - 备选: Deep Link (`m3u8-downloader://download?url=xxx`)

2. **桌面前端 → Sidecar**:
   - API (`http://localhost:15151`)

### Deep Link 格式

```
m3u8-downloader://download?url=<encoded_url>&output_path=<encoded_path>
```

## 注意事项

1. **端口**: Sidecar 服务默认使用 `15151` 端口
2. **FFmpeg**: 需要系统安装 FFmpeg（用于合并视频分片）
3. **Deep Link**: 仅在正式构建后才注册到系统

---

## 架构依赖图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri 桌面应用                            │
│                     (apps/desktop/)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐      ┌──────────────────────────────────┐  │
│  │  React 前端     │ ◄──► │  Tauri Rust (main.rs)            │  │
│  │  (Vite dev)     │      │  - 启动 Sidecar                  │  │
│  │  Port: 5173     │      │  - Deep Link 处理                │  │
│  └─────────────────┘      │  - IPC Commands                   │  │
│                           └───────────┬───────────────────────┘  │
│                                       │                           │
│                                       ▼                           │
│                           ┌──────────────────────────────────┐  │
│                           │  Sidecar (m3u8-server)           │  │
│                           │  ├── 脚本 wrapper                 │  │
│                           │  └── 调用 m3u8-dl server.js       │  │
│                           └───────────┬───────────────────────┘  │
└───────────────────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              m3u8-dl 后端服务 (packages/m3u8-dl/)                │
├─────────────────────────────────────────────────────────────────┤
│  src/                    dist/              全局安装              │
│  ├── downloader.ts   ◄─► │  server.js   ◄─►  @wangjs-jacky/    │
│  ├── server.ts        编译  │  cli.js          m3u8-dl          │
│  └── types.ts              │  index.js        (npm link)        │
│                            └─────────────────────────────────────│
│  开发时修改 → npm run build → 更新 dist → 通过 npm link 同步    │
└─────────────────────────────────────────────────────────────────┘

API 通信: 前端 ◄─► http://localhost:15151 ◄─► 后端服务
```

### 组件关系说明

| 组件 | 位置 | 作用 | 通信方式 |
|------|------|------|----------|
| **React 前端** | `apps/desktop/src/` | 用户界面 | HTTP API → localhost:15151 |
| **Tauri Rust** | `apps/desktop/src-tauri/src/main.rs` | 原生功能、启动 Sidecar | IPC + Sidecar 启动 |
| **Sidecar 脚本** | `src-tauri/binaries/m3u8-server` | 启动 m3u8-dl 服务 | 调用全局 npm link 版本 |
| **m3u8-dl 核心** | `packages/m3u8-dl/` | 视频下载逻辑 | Express API Server |

---

## 开发流程指南

### 首次设置（一次性）

```bash
# 1. 在 m3u8-dl 目录创建全局 npm link
cd packages/m3u8-dl
npm link

# 2. 验证链接成功
ls -la $(npm root -g)/@wangjs-jacky/m3u8-dl
# 应该看到符号链接指向你的本地开发目录

# 3. 编译 m3u8-dl 并更新 Sidecar
cd ../../apps/desktop
./scripts/build-sidecar.sh
```

### 每次开发流程

根据你修改的代码位置，执行相应的操作：

| 修改位置 | 需要执行的命令 | 是否需要重启应用 |
|---------|---------------|------------------|
| **packages/m3u8-dl/src/** | `cd packages/m3u8-dl && npm run build` | ✅ 重启 Tauri 应用 |
| **apps/desktop/src/** (前端) | 无需操作 | ❌ Vite 热更新自动生效 |
| **apps/desktop/src-tauri/** (Rust) | 无需操作 | ⚠️ Cargo 自动检测并重启 |

### 快速开发命令

```bash
# 修改 m3u8-dl 后的完整流程
cd packages/m3u8-dl && npm run build

# 然后在 Tauri 应用中按 Cmd+R (macOS) 或 F5 (Windows/Linux) 刷新
```

### 启动开发环境

```bash
# 方式 1: 直接启动 Tauri dev
cd apps/desktop
npm run tauri:dev

# 方式 2: 分别启动（用于调试）
# 终端 1: 启动 m3u8-dl 服务
cd packages/m3u8-dl
npm run server

# 终端 2: 启动 Tauri 应用
cd apps/desktop
npm run tauri:dev
```

### 重要提示

1. **npm link 同步**: 由于使用了 npm link，修改 `packages/m3u8-dl/src/` 代码后，只需要 `npm run build`，全局链接会自动使用最新的 `dist/` 文件。

2. **Sidecar 端口检查**: Sidecar 脚本会检查 `localhost:15151` 是否已被占用，避免重复启动。

3. **No_proxy 问题**: Rust 代码中已设置 `NO_PROXY=localhost,127.0.0.1` 环境变量，如果仍有代理问题，检查系统 npm 配置：
   ```bash
   npm config get proxy
   npm config get https-proxy
   ```

4. **Dev vs Build 差异**:
   - **dev 模式**: Sidecar 使用 npm link 的全局版本，方便开发调试
   - **build 模式**: 需要确保 `dist/` 已正确编译和打包

---

## 常见问题排查

### Sidecar 没有启动

```bash
# 检查 Sidecar 脚本是否存在
ls -la apps/desktop/src-tauri/binaries/m3u8-server

# 检查 npm link 是否有效
ls -la $(npm root -g)/@wangjs-jacky/m3u8-dl

# 手动测试 Sidecar 脚本
./apps/desktop/src-tauri/binaries/m3u8-server
```

### API 调用失败

```bash
# 检查后端服务是否运行
curl http://localhost:15151/api/downloads

# 查看 Sidecar 日志（在 Tauri 应用终端中）
# 应该看到 [Sidecar stdout] 和 [Sidecar stderr] 输出
```

### 全局版本与本地版本不一致

```bash
# 重新创建 npm link
cd packages/m3u8-dl
npm unlink -g @wangjs-jacky/m3u8-dl
npm link

# 重新编译
npm run build
```
