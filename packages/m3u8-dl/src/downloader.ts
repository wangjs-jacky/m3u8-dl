/**
 * 下载器核心模块 - 支持 AES-128 解密和断点续传
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';
import {
  DownloadOptions, DownloadState, ProgressCallback, ParsedPlaylist,
  PreviewConfig, PreviewFile, TaskMeta, SegmentInfo
} from './types';
import { mergeSegments, estimateDuration, checkFFmpeg } from './merger';
import { parseM3U8FromUrl } from './parser';
import { fetchBufferWithProxy, getProxyAgent } from './http';

/** 临时目录前缀 */
const TEMP_DIR_PREFIX = '.temp_segments_';

/** 元数据文件名 */
const META_FILE = 'task_meta.json';

/** 当前元数据版本 */
const META_VERSION = 1;

/**
 * AES-128 解密下载器
 */
export class DecryptingDownloader {
  private id: string;
  private options: DownloadOptions;
  private progressCallback: ProgressCallback;
  private isRunning: boolean = true;
  private paused = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  // 目录结构
  private baseTempDir: string = '';
  private chunksDir: string = '';      // 分片目录（所有分片直接放在这里）
  private previewDir: string = '';     // 预览文件目录

  // 下载状态
  private downloadedIndices: Set<number> = new Set(); // 已下载的分片索引
  private keyBuffer: Buffer | null = null;            // 解密密钥
  private ivString: string = '';                      // IV 字符串
  private baseUrl: string = '';                       // M3U8 基础 URL
  private segments: SegmentInfo[] = [];               // 分片列表

  // 分片详情（用于 UI 显示）
  private completedSegments: number[] = [];           // 已完成的分片索引（最多保留 100 个）
  private failedSegments: Array<{ index: number; error: string }> = []; // 失败的分片
  private recentSegments: Array<{ index: number; status: 'completed' | 'failed'; error?: string }> = []; // 最近处理的分片

  // 预览相关属性
  private previewConfig: PreviewConfig;
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
   * 更新进度状态
   */
  private updateProgress(partial: Partial<DownloadState>): void {
    this.progressCallback({
      ...partial,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 更新分片详情
   */
  private updateSegmentDetail(index: number, status: 'completed' | 'failed', error?: string): void {
    if (status === 'completed') {
      // 添加到已完成列表（最多保留 100 个）
      this.completedSegments.push(index);
      if (this.completedSegments.length > 100) {
        this.completedSegments.shift(); // 移除最旧的记录
      }
    } else if (status === 'failed' && error) {
      // 添加到失败列表（检查是否已存在）
      const existingIndex = this.failedSegments.findIndex(s => s.index === index);
      if (existingIndex === -1) {
        this.failedSegments.push({ index, error });
      }
    }

    // 添加到最近处理列表（最多保留 20 个）
    this.recentSegments.push({ index, status, error });
    if (this.recentSegments.length > 20) {
      this.recentSegments.shift();
    }

    // 通过进度回调传递分片详情
    this.updateProgress({
      segmentsDetail: {
        completed: [...this.completedSegments],
        failed: [...this.failedSegments],
        recent: [...this.recentSegments],
      },
    });
  }

  /**
   * 保存任务元数据
   */
  private saveMeta(): void {
    if (!this.baseTempDir) return;

    const meta: TaskMeta = {
      version: META_VERSION,
      id: this.id,
      url: this.options.url,
      baseUrl: this.baseUrl,
      outputPath: this.options.outputPath,
      totalSegments: this.totalSegments,
      downloadedSegments: Array.from(this.downloadedIndices).sort((a, b) => a - b),
      createdAt: new Date().toISOString(),
      keyUri: undefined,
      keyData: this.keyBuffer ? this.keyBuffer.toString('base64') : undefined,
      iv: this.ivString || undefined,
      referer: this.options.referer,
      concurrency: this.options.concurrency,
      targetDuration: this.avgSegmentDuration,
      previewConfig: this.previewConfig,
    };

    const metaPath = path.join(this.baseTempDir, META_FILE);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    console.log(`[${this.id}] 保存元数据: ${metaPath}`);
  }

  /**
   * 加载任务元数据
   */
  static loadMeta(tempDir: string): TaskMeta | null {
    const metaPath = path.join(tempDir, META_FILE);
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(content) as TaskMeta;
      console.log(`[Loader] 加载元数据: ${metaPath}, 版本: ${meta.version}, 已下载: ${meta.downloadedSegments.length}/${meta.totalSegments}`);
      return meta;
    } catch (error) {
      console.error(`[Loader] 加载元数据失败: ${error}`);
      return null;
    }
  }

  /**
   * 获取临时目录路径
   */
  static getTempDir(id: string, outputDir: string): string {
    return path.join(outputDir, `${TEMP_DIR_PREFIX}${id}`);
  }

  /**
   * 下载 AES-128 密钥
   */
  private async downloadKey(keyUrl: string): Promise<Buffer> {
    this.updateProgress({
      status: 'downloading_key',
      message: '下载密钥...',
      progress: 0,
    });

    console.log(`[${this.id}] 下载密钥: ${keyUrl}`);
    const data = await fetchBufferWithProxy(keyUrl, {
      headers: {
        'Referer': this.options.referer || '',
      },
    });

    console.log(`[${this.id}] 密钥长度: ${data.byteLength} 字节`);
    return data;
  }

  /**
   * 解密视频分片 (AES-128 CBC)
   */
  private decryptSegment(encryptedData: Buffer, key: Buffer, iv: string): Buffer {
    // IV 格式: 0x... 或直接十六进制字符串
    let ivBuffer: Buffer;
    if (iv.startsWith('0x') || iv.startsWith('0X')) {
      ivBuffer = Buffer.from(iv.slice(2), 'hex');
    } else if (iv) {
      ivBuffer = Buffer.from(iv, 'hex');
    } else {
      // 如果没有指定 IV，使用分片索引作为 IV（通常为 0）
      ivBuffer = Buffer.alloc(16, 0);
    }

    const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuffer);
    decipher.setAutoPadding(true); // PKCS7 padding

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted;
  }

  /**
   * 解析错误类型和 HTTP 状态码
   */
  private parseError(errorMsg: string): { code?: number; type: string } {
    // 提取 HTTP 状态码
    const httpMatch = errorMsg.match(/HTTP (\d+)/);
    if (httpMatch) {
      const code = parseInt(httpMatch[1], 10);
      if (code === 403) return { code: 403, type: 'forbidden' };
      if (code === 404) return { code: 404, type: 'not_found' };
      if (code === 401) return { code: 401, type: 'unauthorized' };
      if (code >= 500) return { code, type: 'server_error' };
      return { code, type: 'http_error' };
    }

    // 网络错误
    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
      return { type: 'network' };
    }
    if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
      return { type: 'timeout' };
    }
    if (errorMsg.includes('proxy') || errorMsg.includes('PROXY')) {
      return { type: 'proxy' };
    }

    return { type: 'unknown' };
  }

  /**
   * 生成错误排查建议
   */
  private generateErrorHint(errorStats: Map<string, number>, sampleErrors: string[]): string {
    const hints: string[] = [];

    if (errorStats.has('forbidden')) {
      hints.push('• 403 禁止访问：可能需要设置正确的 Referer 或 Cookie');
    }
    if (errorStats.has('not_found')) {
      hints.push('• 404 未找到：视频链接可能已过期，请重新获取 m3u8 链接');
    }
    if (errorStats.has('unauthorized')) {
      hints.push('• 401 未授权：需要登录或提供认证信息');
    }
    if (errorStats.has('server_error')) {
      hints.push('• 服务器错误：视频源服务器暂时不可用，请稍后重试');
    }
    if (errorStats.has('timeout')) {
      hints.push('• 连接超时：网络不稳定，请检查网络或降低并发数');
    }
    if (errorStats.has('proxy')) {
      hints.push('• 代理错误：请检查代理设置是否正确');
    }
    if (errorStats.has('network')) {
      hints.push('• 网络错误：无法连接到服务器，请检查网络连接');
    }

    // 添加示例错误
    if (sampleErrors.length > 0) {
      hints.push(`\n示例错误: ${sampleErrors[0]}`);
    }

    return hints.join('\n');
  }

  /**
   * 下载单个分片（带重试，但对 404/403 不重试）
   */
  private async downloadSegment(
    segUrl: string,
    index: number,
    key: Buffer,
    iv: string,
    tempDir: string,
    maxRetries: number = 3
  ): Promise<{ index: number; success: boolean; error?: string }> {
    const filename = `seg_${String(index).padStart(6, '0')}.ts`;
    const filepath = path.join(tempDir, filename);

    let lastError: string = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await fetchBufferWithProxy(segUrl, {
          headers: {
            'Referer': this.options.referer || '',
          },
          timeout: 30000,
        });

        // 解密分片
        const decrypted = this.decryptSegment(data, key, iv);

        // 保存解密后的分片
        fs.writeFileSync(filepath, decrypted);

        return { index, success: true };
      } catch (error: any) {
        lastError = error.message || String(error);

        // 404/403 表示链接已过期，重试无效，直接跳过
        if (lastError.includes('404') || lastError.includes('403')) {
          console.error(`[${this.id}] 分片 ${index} 链接已过期 (${lastError})，跳过`);
          return { index, success: false, error: `链接已过期: ${lastError}` };
        }

        if (attempt < maxRetries) {
          // 等待一段时间后重试（仅对网络错误等临时问题）
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          console.log(`[${this.id}] 分片 ${index} 重试 ${attempt}/${maxRetries}`);
        }
      }
    }

    console.error(`[${this.id}] 分片 ${index} 失败 (${maxRetries} 次重试后): ${lastError}`);
    return { index, success: false, error: lastError };
  }

  /**
   * 执行下载
   */
  async download(): Promise<void> {
    let tempDir: string = '';

    try {
      // 打印下载参数（调试用）
      console.log('='.repeat(60));
      console.log(`[${this.id}] 开始下载任务`);
      console.log(`[${this.id}] URL: ${this.options.url}`);
      console.log(`[${this.id}] 输出路径: ${this.options.outputPath}`);
      console.log(`[${this.id}] Referer: ${this.options.referer || '(未设置)'}`);
      console.log(`[${this.id}] 并发数: ${this.options.concurrency}`);
      console.log('='.repeat(60));

      // 检查 FFmpeg
      const ffmpegAvailable = await checkFFmpeg();
      if (!ffmpegAvailable) {
        throw new Error('FFmpeg 未安装。请运行: brew install ffmpeg (macOS) 或 sudo apt install ffmpeg (Ubuntu)');
      }

      // 准备输出路径
      let outputPath = this.options.outputPath;
      outputPath = outputPath.replace(/^~/, os.homedir());

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

      this.updateProgress({
        status: 'pending',
        message: '解析 M3U8...',
        progress: 0,
      });

      // 解析 M3U8
      console.log(`[${this.id}] 解析 M3U8: ${this.options.url}`);
      const { playlist, baseUrl } = await parseM3U8FromUrl(
        this.options.url,
        this.options.referer ? { Referer: this.options.referer } : {}
      );

      console.log(`[${this.id}] M3U8 解析成功`);
      console.log(`[${this.id}] 分片数量: ${playlist.segments.length}`);
      console.log(`[${this.id}] 加密: ${playlist.encryption ? playlist.encryption.method : '无'}`);

      // 检查加密
      if (!playlist.encryption) {
        throw new Error('视频未加密，此下载器仅支持 AES-128 加密视频');
      }

      // 下载密钥
      const keyUrl = playlist.encryption.uri.startsWith('http')
        ? playlist.encryption.uri
        : new URL(playlist.encryption.uri, baseUrl).href;

      const key = await this.downloadKey(keyUrl);
      const iv = playlist.encryption.iv;

      // 保存关键信息（用于断点续传）
      this.baseUrl = baseUrl;
      this.keyBuffer = key;
      this.ivString = iv;

      // 根据时长限制计算分片数
      let segments = [...playlist.segments];
      if (this.options.durationLimit) {
        const maxSegments = Math.ceil(
          (this.options.durationLimit * 60) / playlist.targetDuration
        );
        segments = segments.slice(0, maxSegments);
        console.log(
          `[${this.id}] 时长限制 ${this.options.durationLimit} 分钟，下载前 ${segments.length} 个分片`
        );
      }

      // 保存分片列表
      this.segments = segments;

      // 创建临时目录结构
      tempDir = path.join(outputDir, `.temp_segments_${this.id}`);
      this.baseTempDir = tempDir;

      // 创建分片目录和预览目录
      this.chunksDir = path.join(tempDir, 'chunks');
      this.previewDir = path.join(tempDir, 'previews');

      if (!fs.existsSync(this.chunksDir)) {
        fs.mkdirSync(this.chunksDir, { recursive: true });
      }
      if (!fs.existsSync(this.previewDir)) {
        fs.mkdirSync(this.previewDir, { recursive: true });
      }
      console.log(`[${this.id}] 临时目录: ${tempDir}`);

      // 保存总分片数和平均时长
      this.totalSegments = segments.length;
      this.avgSegmentDuration = playlist.targetDuration || 6;

      // 检查已下载的分片（断点续传）
      const existingFiles = fs.existsSync(this.chunksDir)
        ? fs.readdirSync(this.chunksDir).filter(f => f.endsWith('.ts'))
        : [];

      for (const file of existingFiles) {
        const match = file.match(/seg_(\d+)\.ts/);
        if (match) {
          const index = parseInt(match[1], 10);
          this.downloadedIndices.add(index);
        }
      }

      if (this.downloadedIndices.size > 0) {
        console.log(`[${this.id}] 发现已下载分片: ${this.downloadedIndices.size}/${segments.length}`);
      }

      // 保存初始元数据
      this.saveMeta();

      // 更新临时目录路径到状态
      this.updateProgress({
        tempDir: this.chunksDir,
        totalSegments: segments.length,
        downloadedSegments: this.downloadedIndices.size,
      });

      // 初始化自动合成阈值
      if (this.previewConfig.autoMerge && this.previewConfig.triggerMode === 'percentage') {
        this.nextAutoMergeThreshold = this.previewConfig.triggerValue;
      } else if (this.previewConfig.autoMerge && this.previewConfig.triggerMode === 'segments') {
        this.nextAutoMergeThreshold = this.previewConfig.triggerValue;
      }

      this.updateProgress({
        status: 'downloading',
        message: `开始下载 ${segments.length} 个分片...`,
        progress: 0,
      });

      // 并发下载分片
      const concurrency = this.options.concurrency || 8;
      const errorStats = new Map<string, number>();
      const sampleErrors: string[] = [];
      const failedSegments: number[] = []; // 记录失败的分片索引

      // 分批下载
      for (let i = 0; i < segments.length; i += concurrency) {
        await this.waitForResume();
        if (!this.isRunning) {
          // 保存当前进度后退出
          this.saveMeta();
          throw new Error('下载已取消');
        }

        const batch = segments.slice(i, Math.min(i + concurrency, segments.length));

        // 过滤已下载的分片
        const toDownload = batch.filter(seg => !this.downloadedIndices.has(seg.index));

        if (toDownload.length === 0) {
          // 这批已全部下载，跳过
          continue;
        }

        const promises = toDownload.map((seg) => {
          const segUrl = seg.uri.startsWith('http')
            ? seg.uri
            : new URL(seg.uri, this.baseUrl).href;

          return this.downloadSegment(segUrl, seg.index, this.keyBuffer!, this.ivString, this.chunksDir);
        });

        const results = await Promise.all(promises);

        for (const result of results) {
          if (result.success) {
            this.downloadedIndices.add(result.index);
            // 更新分片详情 - 成功
            this.updateSegmentDetail(result.index, 'completed');
          } else if (result.error) {
            // 记录失败的分片，稍后重试
            failedSegments.push(result.index);
            // 收集错误统计
            const { type } = this.parseError(result.error);
            errorStats.set(type, (errorStats.get(type) || 0) + 1);
            if (sampleErrors.length < 3) {
              sampleErrors.push(result.error);
            }
            // 更新分片详情 - 失败
            this.updateSegmentDetail(result.index, 'failed', result.error);
          }
        }

        // 每批下载完成后立即保存元数据（确保进度不丢失）
        this.saveMeta();

        // 使用实际已下载的分片数计算进度（0-100%）
        const progress = Math.floor((this.downloadedIndices.size / segments.length) * 100);
        this.updateProgress({
          status: 'downloading',
          message: `下载中 ${this.downloadedIndices.size}/${segments.length}`,
          progress,
          totalSegments: segments.length,
          downloadedSegments: this.downloadedIndices.size,
        });

        // 检查自动合成
        this.checkAutoMerge(this.downloadedIndices.size);

        // 检测是否连续多批下载失败（避免卡死）
        const totalBatches = Math.ceil(segments.length / concurrency);
        const currentBatch = Math.floor(i / concurrency) + 1;
        const failureRate = failedSegments.length / segments.length;

        // 如果已完成 30% 以上，且失败率超过 90%，提前报错
        if (currentBatch > totalBatches * 0.3 && failureRate > 0.9) {
          const errorHint = this.generateErrorHint(errorStats, sampleErrors);
          throw new Error(`下载失败率过高 (${(failureRate * 100).toFixed(0)}%)，可能 M3U8 链接已过期或网络异常。\n\n排查建议:\n${errorHint}`);
        }
      }

      // 对失败的分片进行二次重试
      if (failedSegments.length > 0) {
        console.log(`[${this.id}] 开始重试 ${failedSegments.length} 个失败的分片...`);
        this.updateProgress({
          status: 'downloading',
          message: `重试 ${failedSegments.length} 个失败分片...`,
        });

        const retrySegments = segments.filter(s => failedSegments.includes(s.index));
        const stillFailed: number[] = [];

        for (let i = 0; i < retrySegments.length; i += concurrency) {
          await this.waitForResume();
          if (!this.isRunning) {
            this.saveMeta();
            throw new Error('下载已取消');
          }

          const batch = retrySegments.slice(i, Math.min(i + concurrency, retrySegments.length));
          const toRetry = batch.filter(seg => !this.downloadedIndices.has(seg.index));

          if (toRetry.length === 0) continue;

          const promises = toRetry.map((seg) => {
            const segUrl = seg.uri.startsWith('http')
              ? seg.uri
              : new URL(seg.uri, this.baseUrl).href;
            // 二次重试时增加重试次数
            return this.downloadSegment(segUrl, seg.index, this.keyBuffer!, this.ivString, this.chunksDir, 5);
          });

          const results = await Promise.all(promises);

          for (const result of results) {
            if (result.success) {
              this.downloadedIndices.add(result.index);
              // 从失败列表中移除
              const idx = failedSegments.indexOf(result.index);
              if (idx > -1) failedSegments.splice(idx, 1);
              // 更新分片详情 - 重试成功
              this.updateSegmentDetail(result.index, 'completed');
            } else {
              stillFailed.push(result.index);
              // 更新分片详情 - 重试仍然失败
              this.updateSegmentDetail(result.index, 'failed', result.error || '重试失败');
            }
          }

          this.saveMeta();
        }

        // 更新最终失败列表
        failedSegments.length = 0;
        failedSegments.push(...stillFailed);
      }

      // 检查是否有成功下载的分片
      if (this.downloadedIndices.size === 0) {
        const errorHint = this.generateErrorHint(errorStats, sampleErrors);
        throw new Error(`所有分片下载失败，可能 M3U8 链接已过期。\n\n排查建议:\n${errorHint}`);
      }

      // 如果有失败的分片，提示用户
      if (failedSegments.length > 0) {
        console.log(`[${this.id}] 警告: ${failedSegments.length} 个分片下载失败，将跳过这些分片继续合并`);
        this.updateProgress({
          message: `警告: ${failedSegments.length} 个分片下载失败，将跳过继续合并`,
        });
      }

      // 最终保存元数据
      this.saveMeta();

      // 获取所有已下载的分片文件并排序
      const segmentFiles = fs.readdirSync(this.chunksDir)
        .filter(f => f.endsWith('.ts'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
          const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
          return numA - numB;
        })
        .map(f => path.join(this.chunksDir, f));

      this.updateProgress({
        status: 'merging',
        message: '合并视频中...',
        progress: 95,
      });

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

      // 合并视频
      await mergeSegments({
        segmentFiles,
        outputPath,
        tempDir: this.baseTempDir,
      });

      const fileSize = fs.statSync(outputPath).size;
      this.updateProgress({
        status: 'completed',
        message: `下载完成! 大小: ${(fileSize / 1024 / 1024).toFixed(1)} MB`,
        progress: 100,
      });

      console.log(`[${this.id}] 下载完成: ${outputPath}`);

      // 下载成功后清理临时目录
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(`[${this.id}] 已清理临时目录: ${tempDir}`);
        } catch (e) {
          console.error(`[${this.id}] 清理临时目录失败:`, e);
        }
      }
    } catch (error: any) {
      console.error(`[${this.id}] 错误:`, error);
      this.updateProgress({
        status: 'error',
        error: error.message,
        message: error.message,
        progress: 0,
      });
      throw error;
    }
    // 注意：不再在 finally 中删除临时目录
    // 仅在下载成功后删除，失败/取消/暂停时保留以便恢复
  }

  /**
   * 取消下载
   */
  cancel(): void {
    this.isRunning = false;
  }

  /**
   * 暂停下载
   */
  pause(): void {
    if (this.paused) {
      return; // 防止重复暂停
    }
    this.paused = true;
    this.pausePromise = new Promise(resolve => {
      this.pauseResolve = resolve;
    });
    // 暂停时保存元数据，确保断点续传数据一致
    this.saveMeta();
    console.log(`[${this.id}] 已暂停，元数据已保存`);
  }

  /**
   * 继续下载
   */
  resume(): void {
    if (!this.paused) {
      return; // 防止重复恢复
    }
    this.paused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }
  }

  /**
   * 等待恢复（内部方法）
   */
  private async waitForResume(): Promise<void> {
    if (this.paused && this.pausePromise) {
      await this.pausePromise;
    }
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

    // 检查分片目录是否存在且有分片
    if (!this.chunksDir || !fs.existsSync(this.chunksDir)) {
      throw new Error('当前没有可合成的分片');
    }

    const files = fs.readdirSync(this.chunksDir).filter(f => f.endsWith('.ts'));
    if (files.length === 0) {
      throw new Error('当前没有可合成的分片');
    }

    this.isPreviewMerging = true;
    this.updateProgress({ isMergingPreview: true, message: '合成预览中...' });

    try {
      // 获取所有分片并排序
      const segmentFiles = files
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
          const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
          return numA - numB;
        })
        .map(f => path.join(this.chunksDir, f));

      // 生成预览文件名
      const previewIndex = this.previews.length + 1;
      const previewFileName = mode === 'temporary'
        ? `preview_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
        : `preview_${String(previewIndex).padStart(3, '0')}.mp4`;
      const previewPath = path.join(this.previewDir, previewFileName);

      // 合并分片生成预览
      await mergeSegments({
        segmentFiles,
        outputPath: previewPath,
        tempDir: this.baseTempDir,
      });

      // 计算时长
      const duration = estimateDuration(segmentFiles.length, this.avgSegmentDuration);

      const previewFile: PreviewFile = {
        file: previewFileName,
        path: previewPath,
        segments: segmentFiles.length,
        duration,
        createdAt: new Date().toISOString(),
        mode,
      };

      this.previews.push(previewFile);

      // 更新最新预览的副本
      const latestPath = path.join(this.previewDir, 'preview_latest.mp4');
      if (fs.existsSync(latestPath)) {
        fs.unlinkSync(latestPath);
      }
      fs.copyFileSync(previewPath, latestPath);

      // 更新状态
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
