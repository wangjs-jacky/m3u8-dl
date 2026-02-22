/**
 * 下载器核心模块 - 支持 AES-128 解密
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';
import { DownloadOptions, DownloadState, ProgressCallback, ParsedPlaylist } from './types';
import { parseM3U8FromUrl } from './parser';
import { mergeSegments, checkFFmpeg } from './merger';
import { fetchBufferWithProxy, getProxyAgent } from './http';

/**
 * AES-128 解密下载器
 */
export class DecryptingDownloader {
  private id: string;
  private options: DownloadOptions;
  private progressCallback: ProgressCallback;
  private isRunning: boolean = true;

  constructor(id: string, options: DownloadOptions, progressCallback: ProgressCallback) {
    this.id = id;
    this.options = {
      concurrency: 8,
      ...options,
    };
    this.progressCallback = progressCallback;
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

      // 创建临时目录
      tempDir = path.join(outputDir, `.temp_segments_${this.id}`);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      console.log(`[${this.id}] 临时目录: ${tempDir}`);

      this.updateProgress({
        status: 'downloading',
        message: `开始下载 ${segments.length} 个分片...`,
        progress: 15,
      });

      // 并发下载分片
      const concurrency = this.options.concurrency || 8;
      const downloaded: { index: number; file: string }[] = [];
      let completed = 0;

      // 分批下载
      for (let i = 0; i < segments.length; i += concurrency) {
        if (!this.isRunning) {
          throw new Error('下载已取消');
        }

        const batch = segments.slice(i, Math.min(i + concurrency, segments.length));
        const promises = batch.map((seg) => {
          const segUrl = seg.uri.startsWith('http')
            ? seg.uri
            : new URL(seg.uri, baseUrl).href;

          return this.downloadSegment(segUrl, seg.index, key, iv, tempDir);
        });

        const results = await Promise.all(promises);

        for (const result of results) {
          completed++;
          if (result.success) {
            const filename = `seg_${String(result.index).padStart(6, '0')}.ts`;
            downloaded.push({ index: result.index, file: path.join(tempDir, filename) });
          }

          const progress = 15 + Math.floor((completed / segments.length) * 80);
          this.updateProgress({
            status: 'downloading',
            message: `下载中 ${completed}/${segments.length}`,
            progress,
          });
        }
      }

      // 检查是否有成功下载的分片
      if (downloaded.length === 0) {
        throw new Error('没有成功下载任何分片，请检查网络连接或视频链接是否有效');
      }

      // 排序并获取文件列表
      downloaded.sort((a, b) => a.index - b.index);
      const segmentFiles = downloaded.map((d) => d.file);

      this.updateProgress({
        status: 'merging',
        message: '合并视频中...',
        progress: 95,
      });

      // 合并视频
      await mergeSegments({
        segmentFiles,
        outputPath,
        tempDir,
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
      // 清理临时目录
      if (tempDir && fs.existsSync(tempDir)) {
        try {
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
}
