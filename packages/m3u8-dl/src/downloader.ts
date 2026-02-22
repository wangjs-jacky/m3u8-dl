/**
 * 下载器核心模块 - 支持 AES-128 解密
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';
import {
  DownloadOptions, DownloadState, ProgressCallback, ParsedPlaylist,
  PreviewConfig, PreviewFile, SegmentPart
} from './types';
import { mergeSegments, mergeSegmentsIncremental, estimateDuration, checkFFmpeg } from './merger';
import { parseM3U8FromUrl } from './parser';
import { fetchBufferWithProxy, getProxyAgent } from './http';

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

  // 预览相关属性
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
   * 更新进度状态
   */
  private updateProgress(partial: Partial<DownloadState>): void {
    this.progressCallback({
      ...partial,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 下载 AES-128 密钥
   */
  private async downloadKey(keyUrl: string): Promise<Buffer> {
    this.updateProgress({
      status: 'downloading_key',
      message: '下载密钥...',
      progress: 10,
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
   * 下载单个分片
   */
  private async downloadSegment(
    segUrl: string,
    index: number,
    key: Buffer,
    iv: string,
    tempDir: string
  ): Promise<{ index: number; success: boolean; error?: string }> {
    const filename = `seg_${String(index).padStart(6, '0')}.ts`;
    const filepath = path.join(tempDir, filename);

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
      const errorMsg = error.message || String(error);
      console.error(`[${this.id}] 分片 ${index} 失败: ${errorMsg}`);
      return { index, success: false, error: errorMsg };
    }
  }

  /**
   * 执行下载
   */
  async download(): Promise<void> {
    let tempDir: string = '';

    try {
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
        progress: 5,
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

      // 保存总分片数和平均时长
      this.totalSegments = segments.length;
      this.avgSegmentDuration = playlist.targetDuration || 6;

      // 初始化自动合成阈值
      if (this.previewConfig.autoMerge && this.previewConfig.triggerMode === 'percentage') {
        this.nextAutoMergeThreshold = this.previewConfig.triggerValue;
      } else if (this.previewConfig.autoMerge && this.previewConfig.triggerMode === 'segments') {
        this.nextAutoMergeThreshold = this.previewConfig.triggerValue;
      }

      this.updateProgress({
        status: 'downloading',
        message: `开始下载 ${segments.length} 个分片...`,
        progress: 15,
      });

      // 并发下载分片
      const concurrency = this.options.concurrency || 8;
      const downloaded: { index: number; file: string }[] = [];
      const errorStats = new Map<string, number>();
      const sampleErrors: string[] = [];
      let completed = 0;

      // 分批下载
      for (let i = 0; i < segments.length; i += concurrency) {
        await this.waitForResume();
        if (!this.isRunning) {
          throw new Error('下载已取消');
        }

        const batch = segments.slice(i, Math.min(i + concurrency, segments.length));
        const promises = batch.map((seg) => {
          const segUrl = seg.uri.startsWith('http')
            ? seg.uri
            : new URL(seg.uri, baseUrl).href;

          return this.downloadSegment(segUrl, seg.index, key, iv, this.currentPartDir);
        });

        const results = await Promise.all(promises);

        for (const result of results) {
          completed++;
          if (result.success) {
            const filename = `seg_${String(result.index).padStart(6, '0')}.ts`;
            downloaded.push({ index: result.index, file: path.join(this.currentPartDir, filename) });
          } else if (result.error) {
            // 收集错误统计
            const { type } = this.parseError(result.error);
            errorStats.set(type, (errorStats.get(type) || 0) + 1);
            if (sampleErrors.length < 3) {
              sampleErrors.push(result.error);
            }
          }

          const progress = 15 + Math.floor((completed / segments.length) * 80);
          this.updateProgress({
            status: 'downloading',
            message: `下载中 ${completed}/${segments.length}`,
            progress,
          });

          // 检查自动合成
          this.checkAutoMerge(completed);
        }
      }

      // 检查是否有成功下载的分片
      if (downloaded.length === 0) {
        const errorHint = this.generateErrorHint(errorStats, sampleErrors);
        const failedCount = completed;
        throw new Error(`所有 ${failedCount} 个分片下载失败。\n\n排查建议:\n${errorHint}`);
      }

      // 最终合并时，先切换目录
      await this.switchPartDirectory();

      // 合并所有部分
      const segmentFiles: string[] = [];
      for (const part of this.segmentParts) {
        const files = fs.readdirSync(part.dirPath)
          .filter(f => f.endsWith('.ts'))
          .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
            const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
            return numA - numB;
          })
          .map(f => path.join(part.dirPath, f));
        segmentFiles.push(...files);
      }

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
    } catch (error: any) {
      console.error(`[${this.id}] 错误:`, error);
      this.updateProgress({
        status: 'error',
        error: error.message,
        message: error.message,
        progress: 0,
      });
      throw error;
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
      ? `preview_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
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

    // 更新最新预览的副本
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
