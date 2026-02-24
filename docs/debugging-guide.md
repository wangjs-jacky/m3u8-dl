# Video Downloader 调试指南

> 本文档面向新手小白，详细说明如何调试本项目的各个模块。

## 目录

1. [项目结构速览](#一项目结构速览)
2. [Chrome 插件调试](#二chrome-插件调试)
3. [Tauri 桌面应用调试](#三tauri-桌面应用调试)
4. [后端服务启动](#四后端服务启动)
5. [构建产物清理指南](#五构建产物清理指南)

---

## 一、项目结构速览

```
video-downloader/
├── apps/
│   └── desktop/              # Tauri 桌面应用（主要产品）
├── packages/
│   ├── m3u8-dl/              # 核心下载库（后端服务）
│   └── video-sniffer/        # Chrome 浏览器插件
├── frontend/                 # [已废弃] 可删除
└── dist/                     # [已废弃] 可删除
```

**三个核心模块**：
| 模块 | 技术栈 | 位置 |
|------|--------|------|
| Chrome 插件 | Plasmo + React | `packages/video-sniffer/` |
| Tauri 桌面应用 | Tauri v2 + React | `apps/desktop/` |
| 后端服务 | Node.js + Express | `packages/m3u8-dl/` |

---

## 二、Chrome 插件调试

### 2.1 构建插件

```bash
# 进入插件目录
cd packages/video-sniffer

# 开发模式构建（支持热更新）
npm run dev

# 或者生产模式构建
npm run build
```

**构建产物位置**：
- 开发版：`packages/video-sniffer/build/chrome-mv3-dev/`
- 生产版：`packages/video-sniffer/build/chrome-mv3-prod/`

### 2.2 加载插件到 Chrome

1. 打开 Chrome 浏览器
2. 地址栏输入：`chrome://extensions/`
3. 开启右上角的 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**
5. 选择目录：
   ```
   video-downloader/packages/video-sniffer/build/chrome-mv3-dev/
   ```

### 2.3 调试 Popup 弹窗

1. 点击 Chrome 工具栏的插件图标
2. 在弹出的窗口中 **右键 → 检查**
3. 会打开 DevTools，可以：
   - 查看 Console 日志
   - 查看 Elements 元素
   - 查看 Sources 源码
   - 设置断点调试

### 2.4 调试 Background 后台脚本

1. 进入 `chrome://extensions/`
2. 找到你的插件，点击 **「Service Worker」** 链接
3. 会打开 DevTools，可以调试后台脚本

### 2.5 调试 Content Script（内容脚本）

如果有内容脚本注入到网页：
1. 打开目标网页
2. 按 `F12` 打开 DevTools
3. 在 Console 中可以看到内容脚本的日志

### 2.6 查看插件日志

在插件代码中使用 `console.log()` 输出日志：
- **Popup 中的日志** → 在 Popup 的 DevTools 中查看
- **Background 中的日志** → 在 Service Worker 的 DevTools 中查看
- **Content Script 中的日志** → 在目标网页的 DevTools 中查看

### 2.7 重新加载插件

修改代码后需要重新加载插件：
1. 进入 `chrome://extensions/`
2. 点击插件卡片上的 **刷新图标** 🔄
3. 或者使用开发模式 `npm run dev`，Plasmo 会自动热更新

---

## 三、Tauri 桌面应用调试

### 3.1 启动开发模式

```bash
# 进入桌面应用目录
cd apps/desktop

# 启动开发模式（会同时启动前端和 Tauri）
npm run tauri:dev
```

这会：
1. 启动 Vite 开发服务器（前端热更新）
2. 编译并运行 Tauri 应用（Rust 后端）
3. 打开应用窗口

### 3.2 调试前端（React）

**方法一：使用 DevTools**
- 在 Tauri 应用窗口中按 `F12` 或 `Ctrl+Shift+I`（Windows）/ `Cmd+Option+I`（Mac）
- 会打开 Chrome DevTools，可以调试前端代码

**方法二：使用浏览器**
- 开发模式下，Vite 会启动一个开发服务器
- 可以在浏览器中访问 `http://localhost:1420` 调试前端

### 3.3 调试 Rust 后端

**方法一：使用 console.log**
在 Rust 代码中使用：
```rust
println!("Debug info: {:?}", some_value);
```
日志会输出到终端（运行 `npm run tauri:dev` 的终端）

**方法二：使用 dbg! 宏**
```rust
dbg!(&some_value);  // 会打印变量名和值
```

**方法三：使用 IDE 调试器**
- VSCode：安装 `rust-analyzer` 和 `CodeLLDB` 插件
- 在 `.vscode/launch.json` 中配置调试

### 3.4 查看 Tauri 日志

```bash
# 终端会显示 Rust 日志
cd apps/desktop
npm run tauri:dev

# 日志示例
[tauri] Running on http://localhost:1420/
[info] Sidecar started on port 15151
```

### 3.5 调试 Sidecar（后端服务）

Tauri 应用会启动一个 Sidecar 进程 `m3u8-server`，调试方法：

1. **查看 Sidecar 日志**
   - 日志会输出到 Tauri 终端

2. **手动测试 API**
   ```bash
   # Sidecar 默认运行在 localhost:15151
   curl http://localhost:15151/api/downloads
   ```

3. **独立运行 Sidecar**
   ```bash
   cd packages/m3u8-dl
   npm run server
   # 这样可以独立调试后端服务
   ```

### 3.6 常见问题排查

| 问题 | 解决方案 |
|------|----------|
| 窗口白屏 | 按 F12 查看 Console 错误 |
| Rust 编译错误 | 运行 `cd src-tauri && cargo check` |
| Sidecar 启动失败 | 检查 `binaries/` 目录是否有可执行文件 |
| 热更新不工作 | 重启 `npm run tauri:dev` |

---

## 四、后端服务启动

### 4.1 进入后端目录

```bash
cd packages/m3u8-dl
```

### 4.2 安装依赖（首次运行）

```bash
npm install
```

### 4.3 启动开发模式

```bash
# 方式一：启动 API Server（推荐调试时使用）
npm run server

# 方式二：CLI 模式
npm run dev
```

**API Server 启动后**：
- 地址：`http://localhost:15151`
- 可以直接用 curl 或 Postman 测试 API

### 4.4 测试 API 端点

```bash
# 健康检查
curl http://localhost:15151/api/downloads

# 启动下载任务
curl -X POST http://localhost:15151/api/download/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/video.m3u8", "outputPath": "./output.mp4"}'

# 查看下载状态
curl http://localhost:15151/api/download/<task-id>/status
```

### 4.5 API 端点列表

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/downloads` | GET | 列出所有下载任务 |
| `/api/download/start` | POST | 启动下载任务 |
| `/api/download/<id>/status` | GET | 获取下载状态 |
| `/api/download/<id>/cancel` | POST | 取消下载 |
| `/api/preview/start` | POST | 启动预览任务 |
| `/api/preview/<id>/segments` | GET | 获取预览分片列表 |

### 4.6 调试后端代码

1. **添加日志**
   ```typescript
   console.log('Debug info:', someData);
   ```

2. **使用 nodemon 热更新**
   - `npm run server` 会使用 nodemon
   - 修改代码后自动重启

3. **使用 VSCode 调试器**
   在 `.vscode/launch.json` 添加：
   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "Debug Server",
     "runtimeExecutable": "npm",
     "runtimeArgs": ["run", "server"],
     "cwd": "${workspaceFolder}/packages/m3u8-dl"
   }
   ```

---

## 五、构建产物清理指南

### 5.1 可以删除的目录

| 目录 | 大小 | 说明 | 删除命令 |
|------|------|------|----------|
| `frontend/` | 76M | 已废弃的旧前端 | `rm -rf frontend/` |
| `dist/`（根目录） | 156K | 旧前端构建产物 | `rm -rf dist/` |
| `apps/desktop/src-tauri/target/` | 5.3G | Rust 构建缓存 | `rm -rf apps/desktop/src-tauri/target/` |
| `packages/video-sniffer/build/` | 3.7M | 插件构建缓存 | `rm -rf packages/video-sniffer/build/` |
| `.plasmo/`（根目录） | - | Plasmo 缓存 | `rm -rf .plasmo/` |
| `packages/video-sniffer/.plasmo/` | 6.2M | Plasmo 缓存 | `rm -rf packages/video-sniffer/.plasmo/` |

### 5.2 需要保留的目录

| 目录 | 说明 |
|------|------|
| `apps/desktop/dist/` | Tauri 前端构建输出，打包时需要 |
| `packages/m3u8-dl/dist/` | npm 发布需要 |

### 5.3 一键清理命令

```bash
# 在项目根目录执行
rm -rf frontend/ dist/ .plasmo/
rm -rf apps/desktop/src-tauri/target/
rm -rf packages/video-sniffer/build/ packages/video-sniffer/.plasmo/

echo "清理完成！"
```

### 5.4 更新 .gitignore（推荐）

在项目根目录的 `.gitignore` 中添加：

```gitignore
# 构建产物
frontend/
dist/

# Rust 构建缓存
apps/desktop/src-tauri/target/

# Plasmo 构建缓存
.plasmo/
packages/video-sniffer/build/
```

---

## 六、快速参考卡片

### 常用命令

```bash
# === Chrome 插件 ===
cd packages/video-sniffer
npm run dev          # 开发构建
npm run build        # 生产构建

# === Tauri 桌面应用 ===
cd apps/desktop
npm run tauri:dev    # 开发模式
npm run tauri:build  # 生产构建

# === 后端服务 ===
cd packages/m3u8-dl
npm run server       # 启动 API Server
npm run dev          # CLI 模式
```

### 调试快捷键

| 操作 | 快捷键 |
|------|--------|
| 打开 DevTools | `F12` 或 `Ctrl+Shift+I` |
| 刷新页面 | `F5` 或 `Ctrl+R` |
| 强制刷新 | `Ctrl+Shift+R` |
| 查看插件 Service Worker | `chrome://extensions/` → 点击链接 |

### 端口占用

| 服务 | 端口 |
|------|------|
| 后端 API | 15151 |
| Vite 开发服务器 | 1420 |

---

## 七、常见问题 FAQ

### Q1: 插件加载后显示错误？

检查是否正确构建：
```bash
cd packages/video-sniffer
npm run build
# 确认 build/chrome-mv3-prod/ 目录存在
```

### Q2: Tauri 启动失败？

1. 检查 Rust 环境：`rustc --version`
2. 检查依赖：`cd apps/desktop/src-tauri && cargo check`
3. 清理缓存：`rm -rf apps/desktop/src-tauri/target/`

### Q3: 后端服务启动失败？

1. 检查端口占用：`lsof -i :15151`
2. 检查依赖：`npm install`
3. 检查 Node 版本：`node --version`（建议 18+）

### Q4: 如何同时调试前端和后端？

开两个终端：
```bash
# 终端 1：启动后端
cd packages/m3u8-dl && npm run server

# 终端 2：启动前端
cd apps/desktop && npm run tauri:dev
```

---

**文档版本**: v1.0
**最后更新**: 2026-02-23
