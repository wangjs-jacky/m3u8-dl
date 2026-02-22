# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 M3U8 视频下载器，支持 AES-128 加密视频的下载和解密。采用前后端分离架构：
- **后端**: Flask API 服务（Python）或 Express API 服务（Node.js），负责视频下载、解密和合并
- **前端**: React + TypeScript + Vite，提供 Web UI 界面

## 后端版本选择

项目提供两种后端实现：

| 版本 | 目录 | 依赖 | 适用场景 |
|------|------|------|----------|
| **Python 版本** | `app.py` | Python 3 + FFmpeg | 已有 Python 环境 |
| **Node.js 版本** | `backend-node/` | 仅需 Node.js | **推荐** - 易于分享部署 |

## 启动命令

### 后端服务 - Node.js 版本（推荐）
```bash
cd backend-node
npm install          # 首次运行需安装依赖
npm run dev          # 启动开发服务器
# 或使用启动脚本
./start.sh
```

### 后端服务 - Python 版本
```bash
# 方式一：使用启动脚本（推荐）
./start.sh

# 方式二：直接启动
python3 app.py
```

**注意**: 两个版本都运行在 http://localhost:5001，请勿同时启动。

### 前端开发 (React + Vite)
```bash
cd frontend
pnpm install          # 首次运行需安装依赖
pnpm dev              # 启动开发服务器（默认 5173 端口，可能自动递增）
pnpm build            # 构建生产版本到 dist/
pnpm preview          # 预览生产构建
```

### 完整开发流程
```bash
# 终端 1: 启动后端
python3 app.py

# 终端 2: 启动前端开发服务器
cd frontend && pnpm dev
```

## 系统依赖

### Node.js 版本（推荐）
- **Node.js 18+**: 唯一必需的依赖（FFmpeg 已内置在 npm 包中）
- 无需额外安装 FFmpeg

### Python 版本
- **Python 3**: 后端运行环境
- **FFmpeg**: 必须安装，用于合并视频分片
  - macOS: `brew install ffmpeg`
  - Ubuntu: `sudo apt install ffmpeg`

## 代码架构

### 后端架构 - Node.js 版本 (backend-node/)

**核心类**: `DecryptingDownloader` (src/downloader.ts)

**技术栈**: Express + TypeScript + Axios + m3u8-parser + fluent-ffmpeg

**API 端点**（与 Python 版本完全兼容）:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 返回前端页面 |
| `/api/download/start` | POST | 启动下载任务 |
| `/api/download/<id>/status` | GET | 获取下载状态（前端每秒轮询） |
| `/api/download/<id>/cancel` | POST | 取消下载 |
| `/api/downloads` | GET | 列出所有下载任务 |

**下载流程**:
1. 使用 `m3u8-parser` 解析 M3U8 播放列表
2. 使用 `axios` 下载 AES-128 加密密钥
3. 使用 `crypto` 模块解密视频分片
4. 使用 `Promise.allSettled` 进行并发下载控制
5. 使用 `fluent-ffmpeg` 合并 TS 分片为 MP4

### 后端架构 - Python 版本 (app.py)

**核心类**: `DecryptingDownloader`

下载状态流转：
```
pending (准备中) → downloading_key (下载密钥) → downloading (下载分片中)
→ merging (合并视频中) → completed (完成) / error (错误) / cancelled (取消)
```

**API 端点**:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 返回前端页面 |
| `/api/download/start` | POST | 启动下载任务 |
| `/api/download/<id>/status` | GET | 获取下载状态（前端每秒轮询） |
| `/api/download/<id>/cancel` | POST | 取消下载 |
| `/api/downloads` | GET | 列出所有下载任务 |

**下载流程**:
1. 解析 M3U8 播放列表
2. 下载 AES-128 加密密钥
3. 多线程并发下载视频分片（使用 `ThreadPoolExecutor`）
4. 使用 FFmpeg 合并 TS 分片为 MP4

### 前端架构

**技术栈**: React 18 + TypeScript + Vite + 原生 CSS

**主要组件**: `App.tsx` - 包含所有下载逻辑和 UI

**状态管理**: 使用 React `useState` 管理本地状态

**通信方式**: 前端通过 `fetch` 轮询 `/api/download/<id>/status` 获取实时进度（每秒一次）

**样式系统**: 玻璃拟态风格（Glassmorphism）
- 深色渐变背景 + 浮动彩色光球动画
- 磨砂玻璃卡片（`backdrop-filter: blur()`）
- CSS 变量定义颜色和效果
- 入场淡入动画

### 其他下载器模块

项目包含多个独立的下载器实现，各有不同特性：
- `m3u8_downloader.py`: 基础版，支持反爬虫、多码率选择
- `m3u8_gui.py`: Tkinter 桌面 GUI 版本
- `smart_downloader.py`: 智能速率控制、断点续传、指数退避重试
- `decrypt_downloader.py`: 独立的解密下载器
- `advanced_downloader.py`: 高级功能下载器

## 分享和部署

### 推荐方式：使用 Node.js 版本

```bash
# 1. 打包项目
zip -r m3u8-downloader.zip video-downloader/

# 2. 对方只需：
cd video-downloader/backend-node
npm install
npm run dev

# 3. 浏览器访问 http://localhost:5001
```

### 其他部署方式
- **Docker**: 使用 `backend-node/` 构建镜像
- **云服务**: 部署到 Vercel/Railway/Render
- **桌面应用**: 可用 Electron 打包（需额外开发）

## 重要注意事项

1. **后端版本选择**:
   - 推荐使用 Node.js 版本（`backend-node/`），只需 Node.js 环境
   - Python 版本（`app.py`）需要额外安装 FFmpeg

2. **时长的处理**: 根据 `duration_limit` 参数计算需要下载的分片数，计算公式：`max_segments = (duration_limit * 60) / segment_duration`

3. **输出路径处理**:
   - 自动展开 `~` 为用户目录
   - 如果路径是目录或无扩展名，自动添加 `video.mp4`
   - 自动创建不存在的输出目录

4. **前端构建输出**: 构建后的文件在 `frontend/dist/`

5. **端口冲突**:
   - 后端默认 5001 端口
   - Vite 开发服务器会自动检测端口冲突（5173、5174...）

6. **API 兼容性**: 两个后端版本的 API 完全兼容，前端可以无缝切换
