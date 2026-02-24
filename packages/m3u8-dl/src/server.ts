/**
 * Express API 服务 - 与 Python 版本 API 完全兼容
 */

import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DecryptingDownloader } from './downloader';
import { DownloadState, PreviewConfig, PreviewFileMode, PreviewFile } from './types';
import { mergeSegments, estimateDuration, checkFFmpeg } from './merger';

const app = express();
app.use(cors());
app.use(express.json());

// 全局下载状态
const downloads: Record<string, DownloadState> = {};
let downloadIdCounter = 0;

// 下载器实例（用于取消）
const downloaders: Record<string, DecryptingDownloader> = {};

// 全局配置（由桌面应用同步）
let globalConfig = {
  defaultOutputPath: path.join(os.homedir(), 'Downloads', 'videos'),
};

// 生成下载 ID
function generateId(): string {
  return `dl_${downloadIdCounter++}`;
}

/**
 * 递归扫描目录，查找所有临时分片目录
 */
function findAllTempDirs(rootDir: string, maxDepth: number = 2): string[] {
  const result: string[] = [];

  if (!fs.existsSync(rootDir) || maxDepth < 0) return result;

  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    // 查找当前目录下的临时目录
    const tempDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('.temp_segments_'))
      .map(e => path.join(rootDir, e.name));
    result.push(...tempDirs);

    // 递归扫描子目录（排除隐藏目录和临时目录本身）
    if (maxDepth > 0) {
      const subDirs = entries.filter(e =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        !e.name.startsWith('.temp_segments_')
      );

      for (const subDir of subDirs) {
        const subPath = path.join(rootDir, subDir.name);
        const found = findAllTempDirs(subPath, maxDepth - 1);
        result.push(...found);
      }
    }
  } catch (error) {
    // 忽略权限错误等
  }

  return result;
}

/**
 * 扫描并恢复未完成的任务（基于当前配置的下载路径）
 */
function scanInterruptedTasks(): void {
  // 使用用户配置的默认下载路径
  const scanRootDir = globalConfig.defaultOutputPath;

  if (!fs.existsSync(scanRootDir)) {
    console.log(`[恢复] 下载路径不存在: ${scanRootDir}`);
    return;
  }

  // 递归扫描配置的下载目录（深度 2）
  const tempDirPaths = findAllTempDirs(scanRootDir, 2);

  console.log(`[恢复] 扫描目录: ${scanRootDir}，发现 ${tempDirPaths.length} 个临时目录`);

  for (const tempPath of tempDirPaths) {
    const chunksDir = path.join(tempPath, 'chunks');

    // 从目录名提取任务 ID
    const dirName = path.basename(tempPath);
    const idMatch = dirName.match(/\.temp_segments_(.+)$/);
    const taskId = idMatch ? idMatch[1] : dirName;

    // 跳过已存在的任务（避免重复添加）
    if (downloads[taskId]) {
      console.log(`[恢复] 跳过已存在的任务: ${taskId}`);
      continue;
    }

    // 尝试加载元数据
    const meta = DecryptingDownloader.loadMeta(tempPath);

    // 检查是否有分片
    if (!fs.existsSync(chunksDir)) continue;
    const tsFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.ts'));
    if (tsFiles.length === 0) continue;

    // 优先使用磁盘实际文件数，而不是元数据记录
    const actualDiskCount = tsFiles.length;
    const metaRecordedCount = meta?.downloadedSegments.length || 0;

    if (actualDiskCount > metaRecordedCount) {
      console.log(`[恢复] 检测到元数据不同步: 磁盘 ${actualDiskCount} 个文件，元数据记录 ${metaRecordedCount} 个`);
    }

    // 计算进度 - 使用实际磁盘文件数
    const totalSegments = meta?.totalSegments || tsFiles.length;
    const downloadedSegments = actualDiskCount;
    const progress = totalSegments > 0 ? Math.floor((downloadedSegments / totalSegments) * 100) : 0;

    // 创建任务状态
    downloads[taskId] = {
      id: taskId,
      url: meta?.url || '',
      outputPath: meta?.outputPath || '',
      progress,
      status: 'paused',
      message: meta
        ? `可恢复下载 (${downloadedSegments}/${totalSegments} 分片)`
        : `发现未完成的分片 (${tsFiles.length} 个)`,
      error: undefined,
      referer: meta?.referer || '',
      createdAt: meta?.createdAt || fs.statSync(tempPath).birthtime.toISOString(),
      timestamp: new Date().toISOString(),
      totalSegments,
      downloadedSegments,
      tempDir: chunksDir,
    };

    // 存储元数据路径用于恢复
    (downloads[taskId] as any)._metaPath = path.join(tempPath, 'task_meta.json');
    (downloads[taskId] as any)._tempPath = tempPath;

    console.log(`[恢复] 发现未完成任务: ${taskId} (${downloadedSegments}/${totalSegments} 分片)`);

    // 更新 ID 计数器
    const numMatch = taskId.match(/dl_(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10) + 1;
      if (num > downloadIdCounter) {
        downloadIdCounter = num;
      }
    }
  }
}

/**
 * 重新扫描未完成任务（用于配置变更后）
 */
function rescanTasks(): void {
  console.log('[恢复] 重新扫描未完成任务...');
  scanInterruptedTasks();
}

// 静态文件服务（前端）
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

/**
 * 获取全局配置
 */
app.get('/api/config', (_req, res) => {
  res.json(globalConfig);
});

/**
 * 设置全局配置（由桌面应用调用）
 */
app.post('/api/config', (req, res) => {
  const { defaultOutputPath } = req.body;

  if (defaultOutputPath) {
    const newPath = defaultOutputPath.replace(/^~/, os.homedir());
    const pathChanged = newPath !== globalConfig.defaultOutputPath;
    // 展开用户目录
    globalConfig.defaultOutputPath = newPath;

    // 如果下载路径变更，重新扫描未完成任务
    if (pathChanged) {
      console.log(`[配置] 下载路径变更为: ${newPath}`);
      rescanTasks();
    }
  }

  res.json({ success: true, config: globalConfig });
});

/**
 * 手动触发重新扫描未完成任务
 */
app.post('/api/scan', (_req, res) => {
  rescanTasks();
  res.json({ success: true, taskCount: Object.keys(downloads).length });
});

/**
 * 刷新单个任务状态（解决卡住问题）
 * - 重新扫描磁盘文件数
 * - 如果任务卡在 downloading 但实际已停止，重置为 paused
 * - 如果输出文件已存在，标记为 completed
 */
app.post('/api/download/:id/refresh', (req, res) => {
  const { id } = req.params;

  console.log(`[刷新] 收到刷新请求: ${id}`);

  if (!downloads[id]) {
    console.log(`[刷新] 任务不存在: ${id}`);
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  const task = downloads[id];
  console.log(`[刷新] 任务当前状态:`, {
    id: task.id,
    status: task.status,
    progress: task.progress,
    downloadedSegments: task.downloadedSegments,
    totalSegments: task.totalSegments,
    timestamp: task.timestamp
  });

  // 首先检查输出文件是否存在（可能已下载完成）
  if (task.outputPath && fs.existsSync(task.outputPath)) {
    const fileSize = fs.statSync(task.outputPath).size;
    if (fileSize > 0) {
      // 输出文件存在且有内容，标记为完成
      const previousStatus = task.status;
      task.status = 'completed';
      task.progress = 100;
      task.message = `下载完成! 大小: ${(fileSize / 1024 / 1024).toFixed(1)} MB`;
      task.timestamp = new Date().toISOString();
      // 清理临时目录引用
      task.tempDir = undefined;
      (task as any)._tempPath = undefined;

      console.log(`[刷新] 任务 ${id}: 检测到输出文件已存在，标记为完成`);

      return res.json({
        success: true,
        task: {
          id: task.id,
          status: 'completed',
          previousStatus,
          progress: 100,
          message: task.message,
          wasStuck: false,
          wasCompleted: true,
        }
      });
    }
  }

  const tempPath = (task as any)._tempPath;

  if (!tempPath || !fs.existsSync(tempPath)) {
    // 临时目录不存在，可能是已清理但状态未更新
    res.status(400).json({ error: '临时目录已清理，任务可能已完成或已删除' });
    return;
  }

  const chunksDir = path.join(tempPath, 'chunks');

  if (!fs.existsSync(chunksDir)) {
    res.status(400).json({ error: '分片目录不存在' });
    return;
  }

  // 统计磁盘上的实际文件数
  const tsFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.ts'));
  const actualDiskCount = tsFiles.length;

  // 获取元数据中的总分片数
  const metaPath = path.join(tempPath, 'task_meta.json');
  let totalSegments = task.totalSegments || tsFiles.length;

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      totalSegments = meta.totalSegments || totalSegments;
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 计算新的进度
  const progress = totalSegments > 0 ? Math.floor((actualDiskCount / totalSegments) * 100) : 0;

  // 检查任务是否卡住（状态是 downloading 但很长时间没更新）
  const lastUpdate = new Date(task.timestamp).getTime();
  const now = Date.now();
  const stuckThreshold = 5 * 60 * 1000; // 5 分钟
  const isStuck = task.status === 'downloading' && (now - lastUpdate) > stuckThreshold;

  // 更新任务状态
  const previousStatus = task.status;
  if (isStuck) {
    // 如果卡住，重置为 paused 状态
    task.status = 'paused';
    task.message = `任务已刷新 (检测到卡住，已重置)`;
    // 清理可能存在的下载器实例
    delete downloaders[id];
  }

  task.downloadedSegments = actualDiskCount;
  task.totalSegments = totalSegments;
  task.progress = progress;
  task.timestamp = new Date().toISOString();

  console.log(`[刷新] 任务 ${id}: 磁盘 ${actualDiskCount}/${totalSegments}, 状态 ${previousStatus} -> ${task.status}`);

  res.json({
    success: true,
    task: {
      id: task.id,
      status: task.status,
      previousStatus,
      progress: task.progress,
      downloadedSegments: task.downloadedSegments,
      totalSegments: task.totalSegments,
      message: task.message,
      wasStuck: isStuck,
    }
  });
});

/**
 * 启动下载
 */
app.post('/api/download/start', (req, res) => {
  const { url, output_path, referer, max_workers, duration_limit, preview_config } = req.body;

  if (!url) {
    res.status(400).json({ error: '缺少 URL 参数' });
    return;
  }

  // 如果没有提供 output_path，使用全局配置的默认路径
  let outputPath: string;
  if (!output_path) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    outputPath = path.join(globalConfig.defaultOutputPath, `video_${timestamp}.mp4`);
  } else {
    // 展开用户目录
    outputPath = output_path.replace(/^~/, os.homedir());
  }

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

  // 解析预览配置
  let previewConfig: PreviewConfig | undefined;
  if (preview_config) {
    previewConfig = {
      autoMerge: preview_config.auto_merge ?? false,
      triggerMode: preview_config.trigger_mode ?? 'disabled',
      triggerValue: preview_config.trigger_value ?? 25,
      fileMode: preview_config.file_mode ?? 'ask',
    };
  }

  // 初始化下载状态
  downloads[downloadId] = {
    id: downloadId,
    url,
    outputPath,
    progress: 0,
    status: 'pending',
    message: '准备中...',
    referer: referer || '',
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
      previewConfig,
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
 * 继续下载（支持断点续传）
 */
app.post('/api/download/:id/resume', async (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  const task = downloads[id];

  // 如果有活跃的下载器，直接恢复
  if (downloaders[id]) {
    downloaders[id].resume();
    task.status = 'downloading';
    task.message = '继续下载中...';
    res.json({ status: 'resumed' });
    return;
  }

  // 没有活跃下载器，但有元数据 - 尝试恢复下载
  const metaPath = (task as any)._metaPath;
  if (!metaPath || !fs.existsSync(metaPath)) {
    res.status(400).json({ error: '无法恢复：缺少元数据' });
    return;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    if (!meta.url) {
      res.status(400).json({ error: '无法恢复：元数据中没有 URL' });
      return;
    }

    // 检查是否已完成（使用实际磁盘文件数判断）
    const tempPath = (task as any)._tempPath;
    const chunksDir = tempPath ? path.join(tempPath, 'chunks') : null;
    let actualDiskCount = meta.downloadedSegments.length;

    if (chunksDir && fs.existsSync(chunksDir)) {
      const tsFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.ts'));
      actualDiskCount = tsFiles.length;
    }

    if (actualDiskCount >= meta.totalSegments) {
      task.status = 'paused';
      task.message = '所有分片已下载完成，可以进行合并';
      task.downloadedSegments = actualDiskCount;
      res.json({ status: 'completed', message: '所有分片已下载完成，可以进行合并' });
      return;
    }

    // 先测试 M3U8 URL 是否还有效
    console.log(`[Resume] 检查 M3U8 URL 是否有效...`);
    try {
      const testResponse = await fetch(meta.url, {
        method: 'HEAD',
        headers: meta.referer ? { 'Referer': meta.referer } : {},
      });

      if (!testResponse.ok) {
        const errorMsg = testResponse.status === 403
          ? 'M3U8 链接已过期 (403)，请重新获取视频链接'
          : testResponse.status === 404
          ? 'M3U8 链接不存在 (404)，请重新获取视频链接'
          : `M3U8 链接无效 (${testResponse.status})，请重新获取视频链接`;

        task.status = 'error';
        task.error = errorMsg;
        task.message = errorMsg;
        res.status(400).json({ error: errorMsg });
        return;
      }
    } catch (fetchError: any) {
      console.error(`[Resume] M3U8 URL 测试失败: ${fetchError.message}`);
      // 网络错误不阻止恢复，让下载器自己去处理
    }

    // 重新启动下载（下载器会自动检测已下载的分片）
    task.status = 'downloading';
    task.message = '恢复下载中...';
    task.downloadedSegments = actualDiskCount; // 更新为实际磁盘数量

    // 创建新的下载器
    const downloader = new DecryptingDownloader(
      id,
      {
        url: meta.url,
        outputPath: meta.outputPath,
        referer: meta.referer || '',
        concurrency: meta.concurrency || 8,
        previewConfig: meta.previewConfig,
      },
      (state) => {
        if (downloads[id]) {
          downloads[id] = {
            ...downloads[id],
            ...state,
          };
        }
      }
    );

    downloaders[id] = downloader;

    // 异步执行下载
    downloader.download().catch((error) => {
      console.error(`[Resume] 下载失败: ${error.message}`);
      if (downloads[id]) {
        downloads[id].status = 'error';
        downloads[id].error = error.message;
        downloads[id].message = `下载失败: ${error.message}`;
      }
    });

    res.json({
      status: 'resumed',
      message: `恢复下载，剩余 ${meta.totalSegments - actualDiskCount} 个分片`,
      downloadedSegments: actualDiskCount,
      totalSegments: meta.totalSegments,
    });
  } catch (error: any) {
    console.error(`[Resume] 恢复失败: ${error.message}`);
    res.status(500).json({ error: `恢复失败: ${error.message}` });
  }
});

/**
 * 列出所有下载
 */
app.get('/api/downloads', (_req, res) => {
  res.json(Object.values(downloads));
});

/**
 * 删除单个任务
 */
app.delete('/api/download/:id', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  // 如果任务正在进行，先取消
  if (downloaders[id] && ['downloading', 'downloading_key', 'merging', 'pending'].includes(downloads[id].status)) {
    downloaders[id].cancel();
  }

  delete downloads[id];
  delete downloaders[id];

  res.json({ status: 'deleted' });
});

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

/**
 * 手动触发预览合成
 */
app.post('/api/download/:id/preview', async (req, res) => {
  const { id } = req.params;
  const { mode } = req.body;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  const task = downloads[id];
  const downloader = downloaders[id];

  // 如果有活跃的下载器，使用它的方法
  if (downloader) {
    try {
      let fileMode: 'temporary' | 'keep' = 'temporary';
      if (mode === 'keep') {
        fileMode = 'keep';
      }
      const preview = await downloader.createPreview(fileMode);

      if (!preview) {
        res.status(400).json({ error: '无法创建预览文件' });
        return;
      }

      res.json({
        success: true,
        previewFile: preview.path,
        segments: preview.segments,
        duration: preview.duration,
      });
    } catch (error: any) {
      const clientErrors = ['当前没有可合成的分片', '正在合成预览，请稍候'];
      const isClientError = clientErrors.some(msg => error.message?.includes(msg));
      res.status(isClientError ? 400 : 500).json({ error: error.message });
    }
    return;
  }

  // 没有活跃下载器的情况（未完成任务），直接从临时目录合并
  try {
    const chunksDir = task.tempDir;
    if (!chunksDir || !fs.existsSync(chunksDir)) {
      res.status(400).json({ error: '分片目录不存在' });
      return;
    }

    // 获取所有分片文件
    const tsFiles = fs.readdirSync(chunksDir)
      .filter(f => f.endsWith('.ts'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
        return numA - numB;
      });

    if (tsFiles.length === 0) {
      res.status(400).json({ error: '没有可合成的分片' });
      return;
    }

    // 检查 FFmpeg
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
      res.status(500).json({ error: 'FFmpeg 未安装' });
      return;
    }

    // 确定预览目录
    const tempDir = path.dirname(chunksDir); // .temp_segments_xxx
    const previewDir = path.join(tempDir, 'previews');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    // 生成预览文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const previewFileName = `preview_${timestamp}.mp4`;
    const previewPath = path.join(previewDir, previewFileName);

    const segmentFiles = tsFiles.map(f => path.join(chunksDir, f));

    // 合并分片
    await mergeSegments({
      segmentFiles,
      outputPath: previewPath,
      tempDir,
    });

    // 计算时长
    const duration = estimateDuration(segmentFiles.length, 6);

    // 更新任务状态
    const previewFile: PreviewFile = {
      file: previewFileName,
      path: previewPath,
      segments: segmentFiles.length,
      duration,
      createdAt: new Date().toISOString(),
      mode: mode === 'keep' ? 'keep' : 'temporary',
    };

    task.previews = task.previews || [];
    task.previews.push(previewFile);
    task.message = `预览已生成: ${previewFileName}`;

    res.json({
      success: true,
      previewFile: previewPath,
      segments: segmentFiles.length,
      duration,
    });
  } catch (error: any) {
    console.error('[Preview] 合并失败:', error);
    res.status(500).json({ error: error.message || '合并失败' });
  }
});

/**
 * 获取预览文件列表
 */
app.get('/api/download/:id/preview', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  const downloader = downloaders[id];
  const previews = downloader ? downloader.getPreviews() : (downloads[id].previews || []);

  res.json({ previews });
});

/**
 * 获取最新预览文件路径
 */
app.get('/api/download/:id/preview/latest', (req, res) => {
  const { id } = req.params;

  if (!downloads[id]) {
    res.status(404).json({ error: '下载不存在' });
    return;
  }

  const downloader = downloaders[id];
  const previews = downloader ? downloader.getPreviews() : (downloads[id].previews || []);

  if (previews.length === 0) {
    res.status(404).json({ error: '没有预览文件' });
    return;
  }

  const latest = previews[previews.length - 1];
  res.json({ previewFile: latest });
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
        <li>POST /api/download/:id/pause - 暂停下载</li>
        <li>POST /api/download/:id/resume - 继续下载</li>
        <li>GET /api/downloads - 列出所有下载</li>
      </ul>
    `);
  }
});

const PORT = process.env.PORT || 15151;

// 扫描未完成的任务
scanInterruptedTasks();

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('M3U8 视频下载器 - 后端服务 (Node.js)');
  console.log('='.repeat(50));
  console.log(`服务器启动成功!`);
  console.log(`前端地址: http://localhost:${PORT}`);
  console.log(`API 地址: http://localhost:${PORT}/api`);
  const interruptedCount = Object.keys(downloads).length;
  if (interruptedCount > 0) {
    console.log(`发现 ${interruptedCount} 个未完成任务`);
  }
  console.log('');
  console.log('按 Ctrl+C 停止服务');
  console.log('='.repeat(50));
});
