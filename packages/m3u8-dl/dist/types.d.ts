/**
 * TypeScript 类型定义
 */
/** 分片状态 */
export type SegmentStatus = 'pending' | 'downloading' | 'completed' | 'failed';
/** 单个分片的详细状态 */
export interface SegmentDetail {
    index: number;
    status: SegmentStatus;
    error?: string;
    retryCount?: number;
}
/** 下载状态 */
export type DownloadStatus = 'pending' | 'downloading_key' | 'downloading' | 'paused' | 'merging' | 'completed' | 'error' | 'cancelled';
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
    referer?: string;
    totalSegments?: number;
    downloadedSegments?: number;
    segmentsDetail?: {
        completed: number[];
        failed: Array<{
            index: number;
            error: string;
        }>;
        recent?: Array<{
            index: number;
            status: SegmentStatus;
            error?: string;
        }>;
    };
    tempDir?: string;
    isMergingPreview?: boolean;
    previews?: PreviewFile[];
    lastPreviewAt?: string;
}
/** 下载选项 */
export interface DownloadOptions {
    url: string;
    outputPath: string;
    referer?: string;
    concurrency?: number;
    durationLimit?: number;
    previewConfig?: PreviewConfig;
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
    autoMerge: boolean;
    triggerMode: PreviewTriggerMode;
    triggerValue: number;
    fileMode: PreviewFileMode;
}
/** 预览文件信息 */
export interface PreviewFile {
    file: string;
    path: string;
    segments: number;
    duration: string;
    createdAt: string;
    mode: PreviewFileMode;
}
/** 增量合并的分片部分 */
export interface SegmentPart {
    index: number;
    dirPath: string;
    segmentCount: number;
    segmentIndices: number[];
}
/** 增量合并选项 */
export interface IncrementalMergeOptions {
    parts: SegmentPart[];
    outputPath: string;
    tempDir: string;
    previewDir: string;
}
/** 任务元数据（用于断点续传） */
export interface TaskMeta {
    version: number;
    id: string;
    url: string;
    baseUrl: string;
    outputPath: string;
    totalSegments: number;
    downloadedSegments: number[];
    createdAt: string;
    keyUri?: string;
    keyData?: string;
    iv?: string;
    referer?: string;
    concurrency?: number;
    targetDuration?: number;
    previewConfig?: PreviewConfig;
}
/** 中断任务信息 */
export interface InterruptedTask {
    tempDir: string;
    meta: TaskMeta;
    progress: number;
}
//# sourceMappingURL=types.d.ts.map