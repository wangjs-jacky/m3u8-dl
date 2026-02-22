/**
 * Express API 服务 - 与 Python 版本 API 完全兼容
 */

import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DecryptingDownloader } from './downloader';
import { DownloadState } from './types';

const app = express();
app.use(cors());
app.use(express.json());

// 全局下载状态
const downloads: Record<string, DownloadState> = {};
let downloadIdCounter = 0;

// 下载器实例（用于取消）
const downloaders: Record<string, DecryptingDownloader> = {};

// 生成下载 ID
function generateId(): string {
  return `dl_${downloadIdCounter++}`;
}

// 静态文件服务（前端）
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

/**
 * 启动下载
 */
app.post('/api/download/start', (req, res) => {
  const { url, output_path, referer, max_workers, duration_limit } = req.body;

  if (!url || !output_path) {
    res.status(400).json({ error: '缺少必要参数' });
    return;
  }

  // 展开用户目录
  let outputPath = output_path.replace(/^~/, os.homedir());

  // 如果路径是目录，添加默认文件名
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
    outputPath = path.join(outputPath, 'video.mp4');
  } else if (!path.extname(outputPath)) {
    outputPath = path.join(outputPath, 'video.mp4');
  }

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const downloadId = generateId();

  // 初始化下载状态
  downloads[downloadId] = {
    id: downloadId,
    url,
    outputPath,
    progress: 0,
    status: 'pending',
    message: '准备中...',
    createdAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  };

  // 创建下载器
  const downloader = new DecryptingDownloader(
    downloadId,
    {
      url,
      outputPath,
      referer: referer || '',
      concurrency: max_workers || 8,
      durationLimit: duration_limit,
    },
    (state) => {
      // 更新下载状态
      if (downloads[downloadId]) {
        downloads[downloadId] = {
          ...downloads[downloadId],
          ...state,
        };
      }
    }
  );

  downloaders[downloadId] = downloader;

  // 异步执行下载
  downloader.download().catch((error) => {
    console.error(`[${downloadId}] 下载错误:`, error);
  });

  res.json({ download_id: downloadId, status: 'started' });
});

/**
 * 获取下载状态
 */
app.get('/api/download/:id/status', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  res.json(downloads[id]);
});

/**
 * 取消下载
 */
app.post('/api/download/:id/cancel', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  // 取消下载器
  if (downloaders[id]) {
    downloaders[id].cancel();
  }

  downloads[id].status = 'cancelled';
  downloads[id].message = '已取消';

  res.json({ status: 'cancelled' });
});

/**
 * 列出所有下载
 */
app.get('/api/downloads', (_req, res) => {
  res.json(Object.values(downloads));
});

/**
 * 默认路由（返回前端页面）
 */
app.get('/', (_req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <h1>M3U8 视频下载器 API</h1>
      <p>前端未构建，请运行: cd frontend && pnpm build</p>
      <h2>API 端点</h2>
      <ul>
        <li>POST /api/download/start - 启动下载</li>
        <li>GET /api/download/:id/status - 获取状态</li>
        <li>POST /api/download/:id/cancel - 取消下载</li>
        <li>GET /api/downloads - 列出所有下载</li>
      </ul>
    `);
  }
});

const PORT = process.env.PORT || 15151;

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('M3U8 视频下载器 - 后端服务 (Node.js)');
  console.log('='.repeat(50));
  console.log(`服务器启动成功!`);
  console.log(`前端地址: http://localhost:${PORT}`);
  console.log(`API 地址: http://localhost:${PORT}/api`);
  console.log('');
  console.log('按 Ctrl+C 停止服务');
  console.log('='.repeat(50));
});
