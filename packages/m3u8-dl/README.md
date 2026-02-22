# m3u8-dl

M3U8 视频下载器 - 支持 AES-128 解密、代理、时长限制。

## 特性

- **AES-128 解密** - 自动检测并解密 AES-128 加密的视频分片
- **代理支持** - 支持 HTTP/HTTPS/SOCKS5 代理
- **时长限制** - 可指定下载时长，适合预览或测试
- **并发下载** - 可配置并发数，提高下载速度
- **进度显示** - 实时显示下载进度和状态
- **双模式** - 支持 CLI 命令行和 API 服务两种使用方式

## 安装

### 全局安装

```bash
npm install -g m3u8-dl
```

### 本地安装

```bash
npm install m3u8-dl
```

## 系统依赖

- **Node.js** >= 16.0.0
- **FFmpeg** - 用于合并视频分片
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: 从 [ffmpeg.org](https://ffmpeg.org/download.html) 下载

## 使用方法

### CLI 命令行

```bash
m3u8-dl <url> [options]
```

#### 选项

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--output` | `-o` | 输出文件路径 | `./video.mp4` |
| `--referer` | `-r` | Referer 请求头 | - |
| `--concurrency` | `-c` | 并发下载数 | `8` |
| `--duration` | `-d` | 下载时长限制（分钟） | - |
| `--version` | `-v` | 显示版本号 | - |
| `--help` | `-h` | 显示帮助信息 | - |

#### 示例

```bash
# 基础下载
m3u8-dl https://example.com/video.m3u8

# 指定输出路径
m3u8-dl https://example.com/video.m3u8 -o ~/Downloads/my_video.mp4

# 带 Referer（某些网站需要）
m3u8-dl https://example.com/video.m3u8 -r "https://example.com/"

# 限制下载时长（仅下载前 5 分钟）
m3u8-dl https://example.com/video.m3u8 -d 5

# 调整并发数
m3u8-dl https://example.com/video.m3u8 -c 16

# 完整示例
m3u8-dl "https://example.com/video.m3u8" \
  -o ~/Downloads/video.mp4 \
  -r "https://example.com/" \
  -d 10 \
  -c 8
```

### API 服务

启动 API 服务器：

```bash
# 开发模式
npm run server

# 或使用 node 直接运行
node dist/server.js
```

服务器将在 `http://localhost:5001` 启动。

#### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/download/start` | POST | 启动下载任务 |
| `/api/download/:id/status` | GET | 获取下载状态 |
| `/api/download/:id/cancel` | POST | 取消下载 |
| `/api/downloads` | GET | 列出所有下载任务 |

#### 启动下载

```bash
curl -X POST http://localhost:5001/api/download/start \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/video.m3u8",
    "output_path": "/path/to/output.mp4",
    "referer": "https://example.com/",
    "duration_limit": 5
  }'
```

响应：

```json
{
  "download_id": "dl_0",
  "status": "started"
}
```

#### 查询状态

```bash
curl http://localhost:5001/api/download/dl_0/status
```

响应：

```json
{
  "id": "dl_0",
  "status": "downloading",
  "progress": 50,
  "message": "下载中 18/36"
}
```

### 编程方式使用

```typescript
import { DecryptingDownloader } from 'm3u8-dl';

const downloader = new DecryptingDownloader(
  'my-download',
  {
    url: 'https://example.com/video.m3u8',
    outputPath: './video.mp4',
    referer: 'https://example.com/',
    concurrency: 8,
    durationLimit: 5, // 分钟
  },
  (state) => {
    console.log(`进度: ${state.progress}%`);
    console.log(`状态: ${state.status}`);
    console.log(`消息: ${state.message}`);
  }
);

await downloader.download();
```

## 代理配置

支持自动读取以下环境变量：

```bash
# HTTP/HTTPS 代理
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

# SOCKS5 代理
export ALL_PROXY=socks5h://127.0.0.1:1088
```

## 开发

```bash
# 克隆仓库
git clone https://github.com/wangjs-jacky/m3u8-dl.git
cd m3u8-dl

# 安装依赖
npm install

# 构建
npm run build

# 开发模式（CLI）
npm run dev

# 开发模式（API 服务器）
npm run server
```

## 注意事项

1. **仅支持 AES-128 加密** - 不支持 DRM（如 Widevine、PlayReady）
2. **需要 FFmpeg** - 用于合并视频分片为 MP4 格式
3. **网络稳定性** - 下载大文件时请确保网络稳定
4. **合法使用** - 请确保有权下载目标视频内容

## 常见问题

### 下载失败：没有成功下载任何分片

- 检查网络连接是否正常
- 确认 M3U8 链接是否有效（可在浏览器中直接访问测试）
- 某些网站需要 Referer，请使用 `-r` 参数指定

### FFmpeg 未安装

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# 从 https://ffmpeg.org/download.html 下载并添加到 PATH
```

### 代理不生效

确保环境变量已正确设置：

```bash
# 检查当前代理设置
echo $ALL_PROXY
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

## License

[MIT](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request！
