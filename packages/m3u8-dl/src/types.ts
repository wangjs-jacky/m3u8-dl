/**
 * TypeScript 类型定义
 */

import { SpawnOptions } from 'child_process';

/** 下载状态 */
export type DownloadStatus =
  | 'pending'
  | 'downloading_key'
  | 'downloading'
  | 'paused'
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

/** 增量合并的分片部分 */
export interface SegmentPart {
  dirPath: string;        // 分片目录路径
  startSegment: number;   // 起始分片索引
  endSegment: number;     // 结束分片索引
}

/** 增量合并选项 */
export interface IncrementalMergeOptions {
  parts: SegmentPart[];   // 要合并的分片部分
  outputPath: string;     // 输出文件路径
  tempDir: string;        // 临时目录
  previewDir: string;     // 预览文件目录
}
