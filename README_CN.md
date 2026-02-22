# M3U8 视频下载器

一个功能强大的 M3U8 视频下载工具，支持 **AES-128 加密视频**的自动解密，提供简洁的 Web UI 界面。

[English](./README.md)

## 功能特点

### 核心功能
- **Web UI 界面** - 简洁易用的浏览器界面
- **加密支持** - 自动下载密钥并解密 AES-128 加密视频
- **主播放列表** - 自动识别并选择最佳质量的子播放列表
- **非加密支持** - 同时支持加密和非加密视频
- **并发下载** - 多线程下载，速度更快
- **进度显示** - 实时显示下载进度和状态
- **时长限制** - 支持只下载视频的前 N 分钟

### 反爬虫处理
- 自动模拟浏览器请求头
- 支持自定义 Referer
- 智能重试失败分片

## 快速开始

### 1. 安装依赖

```bash
# Node.js 版本（推荐）
cd packages/m3u8-dl
npm install

# 或 Python 版本
pip3 install m3u8 pycryptodome flask flask-cors requests
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
```

### 2. 启动服务

```bash
# Node.js 版本
npm run server

# 或 Python 版本
python3 app.py
```

### 3. 访问界面

打开浏览器访问：http://localhost:5001

---

## 使用说明

### Web UI 界面

1. **输入 M3U8 地址** - 粘贴视频的 .m3u8 链接
2. **设置 Referer**（可选）- 如果视频网站有防盗链，填写来源网址
3. **设置时长限制**（可选）- 只下载前 N 分钟
4. **点击开始下载** - 等待下载完成

### 下载状态说明

| 状态 | 说明 |
|------|------|
| pending | 解析 M3U8 播放列表 |
| downloading_key | 下载加密密钥 |
| downloading | 下载视频分片中 |
| merging | 合并视频文件 |
| completed | 下载完成 |
| error | 下载出错 |
| cancelled | 已取消 |

### API 接口

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/download/start` | POST | 启动下载任务 |
| `/api/download/<id>/status` | GET | 获取下载状态 |
| `/api/download/<id>/cancel` | POST | 取消下载 |
| `/api/downloads` | GET | 列出所有下载任务 |

**启动下载请求示例：**

```bash
curl -X POST http://localhost:5001/api/download/start \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/video.m3u8",
    "outputPath": "./video.mp4",
    "referer": "https://example.com",
    "maxWorkers": 16,
    "durationLimit": 10
  }'
```

## 项目结构

```
video-downloader/
├── packages/
│   └── m3u8-dl/        # 核心下载器包（Node.js）
│       ├── src/
│       │   ├── cli.ts      # CLI 入口
│       │   ├── server.ts   # Web 服务器
│       │   └── downloader.ts
│       └── package.json
├── frontend/           # React 前端
│   ├── src/App.tsx
│   └── package.json
├── app.py              # Python 后端服务器
└── README.md
```

## 常见问题

### 1. FFmpeg 相关错误

**错误信息**：`ffmpeg: command not found`

**解决方法**：
- macOS: `brew install ffmpeg`
- Ubuntu: `sudo apt install ffmpeg`

### 2. 端口被占用

```bash
# 查找并停止占用 5001 端口的进程
lsof -ti:5001 | xargs kill -9
```

### 3. 下载速度慢

- 增加 `maxWorkers` 参数（默认 16）
- 检查网络连接
- 尝试使用代理

## 技术栈

### 后端
- **Express** - Web 框架（Node.js 版本）
- **Flask** - Web 框架（Python 版本）
- **m3u8-parser** - M3U8 解析
- **crypto** - AES 解密

### 前端
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具

## 注意事项

1. 请遵守目标网站的服务条款
2. 仅用于个人学习和研究
3. 下载的内容请勿用于商业用途
4. 某些网站可能需要有效的 Cookie 或认证

## 许可证

MIT License
