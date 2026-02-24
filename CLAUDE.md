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
