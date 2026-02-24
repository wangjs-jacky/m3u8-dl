# 分段合成功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 M3U8 视频下载过程中，支持手动或自动触发合成已下载的分片，生成可播放的预览视频。

**Architecture:** 通过分片目录切换实现并发合成与下载。点击合成时，将当前分片目录重命名为 part_N，创建新的 part_current 目录继续下载，同时合成进程读取已完成的分片目录生成预览文件。

**Tech Stack:** TypeScript, Node.js, Express, FFmpeg, React, Zustand, Tauri

---

## Task 1: 新增类型定义

**Files:**
- Modify: `packages/m3u8-dl/src/types.ts`

**Step 1: 添加预览配置和状态类型**

在 `types.ts` 末尾添加以下类型定义：

```typescript
/** 预览合成触发模式 */
export type PreviewTriggerMode = 'percentage' | 'segments' | 'disabled';

/** 预览文件处理模式 */
export type PreviewFileMode = 'temporary' | 'keep' | 'ask';

/** 预览配置 */
export interface PreviewConfig {
  autoMerge: boolean;           // 是否自动合成
  triggerMode: PreviewTriggerMode; // 触发模式
  triggerValue: number;          // 百分比或分片数
  fileMode: PreviewFileMode;     // 文件处理模式
}

/** 预览文件信息 */
export interface PreviewFile {
  file: string;           // 文件名
  path: string;           // 完整路径
  segments: number;       // 包含的分片数
  duration: string;       // 时长估计
  createdAt: string;      // 创建时间
  mode: PreviewFileMode;  // 文件模式
}

/** 下载选项扩展 */
export interface DownloadOptions {
  url: string;
  outputPath: string;
  referer?: string;
  concurrency?: number;
  durationLimit?: number;
  previewConfig?: PreviewConfig; // 新增
}

/** 下载状态扩展 */
export interface DownloadState {
  id: string;
  url: string;
  outputPath: string;
  progress: number;
  status: DownloadStatus;
  message: string;
  error?: string;
  createdAt: string;
  timestamp: string;
  // 新增预览相关字段
  previews?: PreviewFile[];
  isMergingPreview?: boolean;
  lastPreviewAt?: string;
}

/** 分片部分信息（用于增量合成） */
export interface SegmentPart {
  index: number;           // 部分索引（1-based）
  dirPath: string;         // 分片目录路径
  segmentCount: number;    // 包含的分片数
  segmentIndices: number[];// 分片索引列表
}

/** 增量合并选项 */
export interface IncrementalMergeOptions {
  parts: SegmentPart[];    // 要合并的部分列表
  outputPath: string;      // 输出路径
  tempDir: string;         // 临时目录
  previewDir: string;      // 预览文件目录
}
```

**Step 2: 验证类型编译**

Run: `cd packages/m3u8-dl && npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add packages/m3u8-dl/src/types.ts
git commit -m "feat(m3u8-dl): 添加分段合成的类型定义"
```

---

## Task 2: 实现增量合并模块

**Files:**
- Modify: `packages/m3u8-dl/src/merger.ts`

**Step 1: 添加增量合并函数**

在 `merger.ts` 中添加以下函数：

```typescript
import { IncrementalMergeOptions, SegmentPart } from './types';

/**
 * 收集目录中的所有分片文件
 */
export function collectSegmentFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.ts'))
    .sort();

  return files.map(f => path.join(dirPath, f));
}

/**
 * 增量合并 - 合并多个分片部分为一个预览文件
 */
export async function mergeSegmentsIncremental(
  options: IncrementalMergeOptions
): Promise<string> {
  const { parts, outputPath, tempDir, previewDir } = options;

  // 确保预览目录存在
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  // 收集所有分片文件
  const allSegmentFiles: string[] = [];
  for (const part of parts) {
    const files = collectSegmentFiles(part.dirPath);
    allSegmentFiles.push(...files);
  }

  if (allSegmentFiles.length === 0) {
    throw new Error('没有可合并的分片');
  }

  console.log(`[Merger] 增量合并 ${parts.length} 个部分，共 ${allSegmentFiles.length} 个分片`);

  // 创建临时合并目录
  const mergeTempDir = path.join(tempDir, `merge_${Date.now()}`);
  fs.mkdirSync(mergeTempDir, { recursive: true });

  try {
    // 创建分片列表文件（使用绝对路径）
    const listFile = path.join(mergeTempDir, 'segments.txt');
    const listContent = allSegmentFiles
      .map((file) => `file '${file}'`)
      .join('\n');
    fs.writeFileSync(listFile, listContent, 'utf-8');

    // 临时 TS 文件
    const tsFile = path.join(mergeTempDir, 'preview.ts');

    // 步骤 1: 合并为 TS
    await runFFmpegConcatAbsolute(listFile, tsFile);

    // 步骤 2: 转换为 MP4
    await runFFmpegConvert(tsFile, outputPath);

    // 清理临时文件
    fs.rmSync(mergeTempDir, { recursive: true, force: true });

    const fileSize = fs.statSync(outputPath).size;
    console.log(`[Merger] 增量合并完成! 文件: ${outputPath}, 大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    return outputPath;
  } catch (error) {
    // 清理临时文件
    if (fs.existsSync(mergeTempDir)) {
      fs.rmSync(mergeTempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * 执行 FFmpeg concat 命令（使用绝对路径）
 */
function runFFmpegConcatAbsolute(listFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      '-y',
      outputFile,
    ];

    console.log(`[Merger] 执行: ffmpeg ${args.join(' ')}`);

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg concat 失败 (code ${code}): ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 执行失败: ${err.message}`));
    });
  });
}

/**
 * 估算视频时长（基于分片数和平均分片时长）
 */
export function estimateDuration(segmentCount: number, avgSegmentDuration: number = 6): string {
  const totalSeconds = segmentCount * avgSegmentDuration;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

**Step 2: 验证编译**

Run: `cd packages/m3u8-dl && npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add packages/m3u8-dl/src/merger.ts
git commit -m "feat(m3u8-dl): 实现增量合并模块"
```

---

## Task 3: 扩展下载器支持分片目录管理

**Files:**
- Modify: `packages/m3u8-dl/src/downloader.ts`

**Step 1: 添加分片目录管理属性和方法**

在 `DecryptingDownloader` 类中添加以下属性和方法：

```typescript
import {
  DownloadOptions, DownloadState, ProgressCallback, ParsedPlaylist,
  PreviewConfig, PreviewFile, SegmentPart
} from './types';
import { mergeSegments, mergeSegmentsIncremental, estimateDuration, checkFFmpeg } from './merger';

export class DecryptingDownloader {
  // ... 现有属性 ...

  // 新增属性
  private previewConfig: PreviewConfig;
  private segmentParts: SegmentPart[] = [];
  private currentPartIndex: number = 1;
  private currentPartDir: string = '';
  private baseTempDir: string = '';
  private previewDir: string = '';
  private previews: PreviewFile[] = [];
  private totalSegments: number = 0;
  private avgSegmentDuration: number = 6;
  private isPreviewMerging: boolean = false;
  private nextAutoMergeThreshold: number = 0;

  constructor(id: string, options: DownloadOptions, progressCallback: ProgressCallback) {
    this.id = id;
    this.options = {
      concurrency: 8,
      ...options,
    };
    this.progressCallback = progressCallback;

    // 初始化预览配置
    this.previewConfig = options.previewConfig || {
      autoMerge: false,
      triggerMode: 'disabled',
      triggerValue: 25,
      fileMode: 'ask',
    };
  }

  /**
   * 获取预览文件列表
   */
  getPreviews(): PreviewFile[] {
    return this.previews;
  }

  /**
   * 手动触发预览合成
   */
  async createPreview(mode: 'temporary' | 'keep' = 'temporary'): Promise<PreviewFile | null> {
    if (this.isPreviewMerging) {
      throw new Error('正在合成预览，请稍候');
    }

    // 如果当前部分没有分片，无法合成
    if (!this.currentPartDir || !fs.existsSync(this.currentPartDir)) {
      throw new Error('当前没有可合成的分片');
    }

    const files = fs.readdirSync(this.currentPartDir).filter(f => f.endsWith('.ts'));
    if (files.length === 0) {
      throw new Error('当前没有可合成的分片');
    }

    this.isPreviewMerging = true;
    this.updateProgress({ isMergingPreview: true, message: '合成预览中...' });

    try {
      // 1. 切换分片目录
      await this.switchPartDirectory();

      // 2. 合成预览
      const previewFile = await this.mergePreviewFile(mode);

      // 3. 更新状态
      this.updateProgress({
        isMergingPreview: false,
        message: `预览已生成: ${previewFile.file}`,
        previews: this.previews,
        lastPreviewAt: new Date().toISOString(),
      });

      return previewFile;
    } catch (error: any) {
      this.updateProgress({
        isMergingPreview: false,
        message: `预览合成失败: ${error.message}`,
      });
      throw error;
    } finally {
      this.isPreviewMerging = false;
    }
  }

  /**
   * 切换分片目录（用于合成预览）
   */
  private async switchPartDirectory(): Promise<void> {
    // 将当前目录重命名为 part_N
    if (this.currentPartDir && fs.existsSync(this.currentPartDir)) {
      const files = fs.readdirSync(this.currentPartDir).filter(f => f.endsWith('.ts'));

      if (files.length > 0) {
        const newPartDir = path.join(this.baseTempDir, 'chunks', `part_${String(this.currentPartIndex).padStart(3, '0')}`);
        fs.renameSync(this.currentPartDir, newPartDir);

        this.segmentParts.push({
          index: this.currentPartIndex,
          dirPath: newPartDir,
          segmentCount: files.length,
          segmentIndices: files.map(f => {
            const match = f.match(/seg_(\d+)\.ts/);
            return match ? parseInt(match[1], 10) : 0;
          }).sort((a, b) => a - b),
        });

        this.currentPartIndex++;
      }
    }

    // 创建新的当前目录
    this.currentPartDir = path.join(this.baseTempDir, 'chunks', 'part_current');
    if (!fs.existsSync(this.currentPartDir)) {
      fs.mkdirSync(this.currentPartDir, { recursive: true });
    }
  }

  /**
   * 合成预览文件
   */
  private async mergePreviewFile(mode: 'temporary' | 'keep'): Promise<PreviewFile> {
    const previewIndex = this.previews.length + 1;
    const previewFileName = mode === 'temporary'
      ? `preview_temp_${Date.now()}.mp4`
      : `preview_${String(previewIndex).padStart(3, '0')}.mp4`;
    const previewPath = path.join(this.previewDir, previewFileName);

    // 合并所有已完成的分片部分
    await mergeSegmentsIncremental({
      parts: this.segmentParts,
      outputPath: previewPath,
      tempDir: this.baseTempDir,
      previewDir: this.previewDir,
    });

    // 计算总时长
    const totalSegments = this.segmentParts.reduce((sum, p) => sum + p.segmentCount, 0);
    const duration = estimateDuration(totalSegments, this.avgSegmentDuration);

    const previewFile: PreviewFile = {
      file: previewFileName,
      path: previewPath,
      segments: totalSegments,
      duration,
      createdAt: new Date().toISOString(),
      mode,
    };

    this.previews.push(previewFile);

    // 更新最新预览的软链接
    const latestPath = path.join(this.previewDir, 'preview_latest.mp4');
    if (fs.existsSync(latestPath)) {
      fs.unlinkSync(latestPath);
    }
    fs.copyFileSync(previewPath, latestPath);

    return previewFile;
  }

  /**
   * 检查是否需要自动合成
   */
  private checkAutoMerge(completedSegments: number): void {
    if (!this.previewConfig.autoMerge || this.previewConfig.triggerMode === 'disabled') {
      return;
    }

    if (this.isPreviewMerging) {
      return;
    }

    let shouldMerge = false;

    if (this.previewConfig.triggerMode === 'percentage') {
      const percentage = (completedSegments / this.totalSegments) * 100;
      if (percentage >= this.nextAutoMergeThreshold) {
        shouldMerge = true;
        this.nextAutoMergeThreshold += this.previewConfig.triggerValue;
      }
    } else if (this.previewConfig.triggerMode === 'segments') {
      if (completedSegments >= this.nextAutoMergeThreshold + this.previewConfig.triggerValue) {
        shouldMerge = true;
        this.nextAutoMergeThreshold += this.previewConfig.triggerValue;
      }
    }

    if (shouldMerge) {
      // 异步触发合成，不阻塞下载
      this.createPreview(this.previewConfig.fileMode === 'ask' ? 'temporary' : this.previewConfig.fileMode)
        .catch(err => console.error(`[${this.id}] 自动合成失败:`, err));
    }
  }
}
```

**Step 2: 修改 download 方法以支持分片目录**

在 `download()` 方法中，修改临时目录创建和分片下载逻辑：

```typescript
async download(): Promise<void> {
  let tempDir: string = '';

  try {
    // ... 现有的 FFmpeg 检查和路径处理代码 ...

    // 创建临时目录结构
    tempDir = path.join(outputDir, `.temp_segments_${this.id}`);
    this.baseTempDir = tempDir;

    // 创建分片目录结构
    const chunksDir = path.join(tempDir, 'chunks');
    this.currentPartDir = path.join(chunksDir, 'part_current');
    this.previewDir = path.join(tempDir, 'previews');

    if (!fs.existsSync(this.currentPartDir)) {
      fs.mkdirSync(this.currentPartDir, { recursive: true });
    }
    if (!fs.existsSync(this.previewDir)) {
      fs.mkdirSync(this.previewDir, { recursive: true });
    }

    console.log(`[${this.id}] 临时目录: ${tempDir}`);

    // ... 解析 M3U8 代码 ...

    // 保存总分片数和平均时长
    this.totalSegments = segments.length;
    this.avgSegmentDuration = playlist.targetDuration || 6;

    // 初始化自动合成阈值
    if (this.previewConfig.autoMerge && this.previewConfig.triggerMode === 'percentage') {
      this.nextAutoMergeThreshold = this.previewConfig.triggerValue;
    } else if (this.previewConfig.autoMerge && this.previewConfig.triggerMode === 'segments') {
      this.nextAutoMergeThreshold = this.previewConfig.triggerValue;
    }

    // ... 下载循环 ...

    // 在下载循环中，修改 downloadSegment 调用，使用 currentPartDir
    // 并在每批下载完成后检查自动合成
    for (let i = 0; i < segments.length; i += concurrency) {
      // ... 现有代码 ...

      // 在更新进度后，检查自动合成
      this.checkAutoMerge(completed);
    }

    // ... 下载完成后的最终合并 ...

    // 最终合并时，包含当前目录的分片
    await this.switchPartDirectory();

    // 合并所有部分
    const allParts = this.segmentParts;
    const segmentFiles: string[] = [];
    for (const part of allParts) {
      const files = fs.readdirSync(part.dirPath)
        .filter(f => f.endsWith('.ts'))
        .sort()
        .map(f => path.join(part.dirPath, f));
      segmentFiles.push(...files);
    }

    // 如果有预览文件且模式为临时，删除预览文件
    if (this.previewConfig.fileMode === 'temporary') {
      for (const preview of this.previews) {
        if (fs.existsSync(preview.path)) {
          fs.unlinkSync(preview.path);
        }
      }
      const latestPath = path.join(this.previewDir, 'preview_latest.mp4');
      if (fs.existsSync(latestPath)) {
        fs.unlinkSync(latestPath);
      }
    }

    // 使用现有的合并逻辑
    await mergeSegments({
      segmentFiles,
      outputPath,
      tempDir: this.baseTempDir,
    });

    // ... 完成处理 ...
  } catch (error: any) {
    // ... 错误处理 ...
  } finally {
    // 清理临时目录（保留预览目录如果需要）
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        // 如果有保留的预览文件，先复制出来
        if (this.previewConfig.fileMode === 'keep' && this.previews.length > 0) {
          const outputDir = path.dirname(this.options.outputPath);
          const previewSaveDir = path.join(outputDir, 'previews');
          if (!fs.existsSync(previewSaveDir)) {
            fs.mkdirSync(previewSaveDir, { recursive: true });
          }
          for (const preview of this.previews) {
            if (fs.existsSync(preview.path)) {
              const destPath = path.join(previewSaveDir, preview.file);
              fs.copyFileSync(preview.path, destPath);
            }
          }
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[${this.id}] 已清理临时目录: ${tempDir}`);
      } catch (e) {
        console.error(`[${this.id}] 清理临时目录失败:`, e);
      }
    }
  }
}
```

**Step 3: 验证编译**

Run: `cd packages/m3u8-dl && npx tsc --noEmit`
Expected: 无错误

**Step 4: Commit**

```bash
git add packages/m3u8-dl/src/downloader.ts
git commit -m "feat(m3u8-dl): 扩展下载器支持分片目录管理和预览合成"
```

---

## Task 4: 扩展 API Server 支持预览端点

**Files:**
- Modify: `packages/m3u8-dl/src/server.ts`

**Step 1: 添加预览相关 API 端点**

在 `server.ts` 中添加以下端点：

```typescript
import { PreviewFile, PreviewConfig, PreviewFileMode } from './types';

// 修改启动下载端点，支持 previewConfig
app.post('/api/download/start', (req, res) => {
  const { url, output_path, referer, max_workers, duration_limit, preview_config } = req.body;

  // ... 现有代码 ...

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

  // 创建下载器时传入 previewConfig
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
      if (downloads[downloadId]) {
        downloads[downloadId] = {
          ...downloads[downloadId],
          ...state,
        };
      }
    }
  );

  // ... 其余代码 ...
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

  const downloader = downloaders[id];
  if (!downloader) {
    res.status(400).json({ error: '下载器不存在' });
    return;
  }

  try {
    const fileMode: PreviewFileMode = mode || 'temporary';
    const preview = await downloader.createPreview(fileMode);

    res.json({
      success: true,
      previewFile: preview.path,
      segments: preview.segments,
      duration: preview.duration,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
```

**Step 2: 在 DecryptingDownloader 类中添加 getPreviews 方法**

确保 `downloader.ts` 中已添加：

```typescript
getPreviews(): PreviewFile[] {
  return this.previews;
}
```

**Step 3: 验证编译**

Run: `cd packages/m3u8-dl && npx tsc --noEmit`
Expected: 无错误

**Step 4: Commit**

```bash
git add packages/m3u8-dl/src/server.ts
git commit -m "feat(m3u8-dl): 添加预览合成 API 端点"
```

---

## Task 5: 扩展前端 Store 支持预览操作

**Files:**
- Modify: `apps/desktop/src/stores/downloadStore.ts`

**Step 1: 添加预览相关类型和方法**

```typescript
// 添加预览配置类型
export interface PreviewConfig {
  autoMerge: boolean
  triggerMode: 'percentage' | 'segments' | 'disabled'
  triggerValue: number
  fileMode: 'temporary' | 'keep' | 'ask'
}

export interface PreviewFile {
  file: string
  path: string
  segments: number
  duration: string
  createdAt: string
  mode: 'temporary' | 'keep' | 'ask'
}

// 扩展 DownloadTask 接口
export interface DownloadTask {
  // ... 现有字段 ...
  previews?: PreviewFile[]
  isMergingPreview?: boolean
  lastPreviewAt?: string
}

// 扩展 AppSettings 接口
export interface AppSettings {
  // ... 现有字段 ...
  previewConfig: PreviewConfig
}

// 在 DownloadStore 接口中添加
interface DownloadStore {
  // ... 现有方法 ...

  // 预览方法
  createPreview: (id: string, mode?: 'temporary' | 'keep') => Promise<void>
  getPreviews: (id: string) => PreviewFile[]
}

// 修改 defaultSettings
const defaultSettings: AppSettings = {
  defaultOutputPath: '~/Downloads/videos',
  maxConcurrent: 8,
  proxyEnabled: false,
  proxyUrl: '',
  autoRetry: true,
  retryCount: 3,
  retryDelay: 5,
  previewConfig: {
    autoMerge: false,
    triggerMode: 'disabled',
    triggerValue: 25,
    fileMode: 'ask',
  },
}

// 在 create 实现中添加
createPreview: async (id, mode = 'temporary') => {
  try {
    const response = await fetch(`${API_BASE}/api/download/${id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    if (response.ok) {
      await get().fetchTasks()
    } else {
      const error = await response.json()
      throw new Error(error.error || '创建预览失败')
    }
  } catch (error) {
    console.error('Failed to create preview:', error)
    throw error
  }
},

getPreviews: (id) => {
  const { tasks } = get()
  const task = tasks.find(t => t.id === id)
  return task?.previews || []
},
```

**Step 2: 验证编译**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add apps/desktop/src/stores/downloadStore.ts
git commit -m "feat(desktop): 扩展 Store 支持预览操作"
```

---

## Task 6: 修改任务表格组件添加合成按钮

**Files:**
- Modify: `apps/desktop/src/components/TaskTable.tsx`

**Step 1: 添加合成按钮和相关逻辑**

```tsx
import { invoke } from '@tauri-apps/api/core'
import { FolderOpen, Pause, Play, Trash2, Inbox, Film, Eye } from 'lucide-react'
import { useDownloadStore, DownloadTask, DownloadStatus } from '../stores/downloadStore'

// 在 getStatusBadgeClass 和 getStatusText 之间添加新函数

function canCreatePreview(task: DownloadTask): boolean {
  // 下载中且进度大于 0 时可以创建预览
  return ['downloading'].includes(task.status) && task.progress > 0 && !task.isMergingPreview
}

// 在 TaskTable 组件中添加
export function TaskTable({ onDoubleClick }: TaskTableProps) {
  const {
    getFilteredTasks,
    selectedTaskIds,
    toggleTaskSelection,
    pauseTask,
    resumeTask,
    deleteTask,
    taskFilter,
    createPreview,  // 新增
  } = useDownloadStore()

  // ... 现有代码 ...

  const handleCreatePreview = async (task: DownloadTask) => {
    try {
      await createPreview(task.id, 'temporary')
    } catch (error) {
      console.error('Failed to create preview:', error)
    }
  }

  const openPreview = async (previewPath: string) => {
    try {
      await invoke('reveal_in_finder', { path: previewPath })
    } catch (error) {
      console.error('Failed to open preview:', error)
    }
  }

  // 在操作按钮区域添加
  return (
    // ...
    <td className="col-actions">
      <div className="task-actions">
        {/* 现有按钮 */}

        {/* 新增：合成预览按钮 */}
        {canCreatePreview(task) && (
          <button
            className="btn-table-action preview"
            onClick={() => handleCreatePreview(task)}
            title="合成当前进度"
            disabled={task.isMergingPreview}
          >
            <Film size={16} />
          </button>
        )}

        {/* 新增：查看预览按钮 */}
        {task.previews && task.previews.length > 0 && (
          <button
            className="btn-table-action"
            onClick={() => openPreview(task.previews![task.previews!.length - 1].path)}
            title={`查看预览 (${task.previews!.length}个)`}
          >
            <Eye size={16} />
          </button>
        )}
      </div>
    </td>
    // ...
  )
}
```

**Step 2: 验证编译**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add apps/desktop/src/components/TaskTable.tsx
git commit -m "feat(desktop): 任务表格添加合成预览按钮"
```

---

## Task 7: 修改设置面板添加预览配置

**Files:**
- Modify: `apps/desktop/src/components/SettingsModal.tsx`

**Step 1: 添加预览设置区域**

在 `SettingsModal.tsx` 中添加：

```tsx
import { Sun, Moon, FolderOpen, Film } from 'lucide-react'

// 在设置面板的 modal-body 中，代理设置之后添加：

{/* 分段合成设置 */}
<div className="settings-section">
  <div className="settings-section-title">
    <Film size={16} style={{ marginRight: '8px' }} />
    分段合成
  </div>

  <div className="settings-row">
    <div className="settings-label">
      <span className="settings-label-text">自动合成预览</span>
      <span className="settings-label-hint">下载时自动生成可播放的预览文件</span>
    </div>
    <label className="switch">
      <input
        type="checkbox"
        checked={settings.previewConfig.autoMerge}
        onChange={(e) => updateSettings({
          previewConfig: { ...settings.previewConfig, autoMerge: e.target.checked }
        })}
      />
      <span className="switch-slider" />
    </label>
  </div>

  {settings.previewConfig.autoMerge && (
    <>
      <div className="settings-row">
        <div className="settings-label">
          <span className="settings-label-text">触发条件</span>
          <span className="settings-label-hint">何时自动合成预览</span>
        </div>
        <select
          className="form-select"
          value={settings.previewConfig.triggerMode}
          onChange={(e) => updateSettings({
            previewConfig: {
              ...settings.previewConfig,
              triggerMode: e.target.value as 'percentage' | 'segments'
            }
          })}
          style={{ width: '120px' }}
        >
          <option value="percentage">按百分比</option>
          <option value="segments">按分片数</option>
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-label">
          <span className="settings-label-text">
            {settings.previewConfig.triggerMode === 'percentage' ? '合成间隔 (%)' : '合成间隔 (分片数)'}
          </span>
          <span className="settings-label-hint">
            {settings.previewConfig.triggerMode === 'percentage'
              ? '每下载多少百分比合成一次'
              : '每下载多少分片合成一次'}
          </span>
        </div>
        <input
          type="number"
          className="form-input form-input-number"
          value={settings.previewConfig.triggerValue}
          onChange={(e) => updateSettings({
            previewConfig: {
              ...settings.previewConfig,
              triggerValue: Math.max(
                settings.previewConfig.triggerMode === 'percentage' ? 10 : 10,
                Math.min(
                  settings.previewConfig.triggerMode === 'percentage' ? 50 : 500,
                  parseInt(e.target.value) || 25
                )
              )
            }
          })}
          min={settings.previewConfig.triggerMode === 'percentage' ? 10 : 10}
          max={settings.previewConfig.triggerMode === 'percentage' ? 50 : 500}
        />
      </div>
    </>
  )}

  <div className="settings-row">
    <div className="settings-label">
      <span className="settings-label-text">预览文件处理</span>
      <span className="settings-label-hint">下载完成后的预览文件处理方式</span>
    </div>
    <select
      className="form-select"
      value={settings.previewConfig.fileMode}
      onChange={(e) => updateSettings({
        previewConfig: {
          ...settings.previewConfig,
          fileMode: e.target.value as 'temporary' | 'keep' | 'ask'
        }
      })}
      style={{ width: '120px' }}
    >
      <option value="ask">每次询问</option>
      <option value="temporary">临时预览（自动删除）</option>
      <option value="keep">独立保存</option>
    </select>
  </div>
</div>
```

**Step 2: 添加 select 样式（如需要）**

在 `App.css` 中添加：

```css
.form-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.form-select:focus {
  outline: none;
  border-color: var(--primary-color);
}
```

**Step 3: 验证编译**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: 无错误

**Step 4: Commit**

```bash
git add apps/desktop/src/components/SettingsModal.tsx apps/desktop/src/App.css
git commit -m "feat(desktop): 设置面板添加分段合成配置"
```

---

## Task 8: 集成测试和最终验证

**Step 1: 编译 m3u8-dl 包**

Run: `cd packages/m3u8-dl && npm run build`
Expected: 编译成功，无错误

**Step 2: 编译桌面应用**

Run: `cd apps/desktop && npm run build`
Expected: 编译成功，无错误

**Step 3: 验证 Tauri 编译**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: 编译成功，无错误

**Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: 完成分段合成功能实现"
```

---

## 验收标准

1. **手动合成**: 下载过程中点击"合成当前进度"按钮，能生成可播放的预览文件
2. **自动合成**: 开启自动合成后，按配置的百分比/分片数自动生成预览
3. **继续下载**: 合成过程中下载不中断
4. **预览文件**: 预览文件可以正常播放
5. **设置持久化**: 预览配置保存后重启应用仍然有效
