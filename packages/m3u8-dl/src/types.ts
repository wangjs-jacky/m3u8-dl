/**
 * TypeScript 类型定义
 */

import { SpawnOptions } from 'child_process';

/** 下载状态 */
export type DownloadStatus =
  | 'pending'
  | 'downloading_key'
  | 'downloading'
  | 'merging'
  | 'completed'
  | 'error'
  | 'cancelled';

/** 下载状态信息 */
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
}

/** 下载选项 */
export interface DownloadOptions {
  url: string;
  outputPath: string;
  referer?: string;
  concurrency?: number;
  durationLimit?: number; // 分钟
}

/** M3U8 加密信息 */
export interface EncryptionInfo {
  method: string;
  uri: string;
  iv: string;
}

/** M3U8 分片信息 */
export interface SegmentInfo {
  uri: string;
  duration: number;
  index: number;
}

/** M3U8 播放列表解析结果 */
export interface ParsedPlaylist {
  targetDuration: number;
  segments: SegmentInfo[];
  encryption: EncryptionInfo | null;
}

/** 进度回调函数 */
export type ProgressCallback = (state: Partial<DownloadState>) => void;

/** FFmpeg 合并选项 */
export interface MergeOptions {
  segmentFiles: string[];
  outputPath: string;
  tempDir: string;
}

/** HTTP 请求配置 */
export interface HttpConfig {
  headers: Record<string, string>;
  timeout?: number;
}
