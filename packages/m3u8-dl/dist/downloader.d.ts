/**
 * 下载器核心模块 - 支持 AES-128 解密和断点续传
 */
import { DownloadOptions, ProgressCallback, PreviewFile, TaskMeta } from './types';
/**
 * AES-128 解密下载器
 */
export declare class DecryptingDownloader {
    private id;
    private options;
    private progressCallback;
    private isRunning;
    private paused;
    private pausePromise;
    private pauseResolve;
    private baseTempDir;
    private chunksDir;
    private previewDir;
    private downloadedIndices;
    private keyBuffer;
    private ivString;
    private baseUrl;
    private segments;
    private previewConfig;
    private previews;
    private totalSegments;
    private avgSegmentDuration;
    private isPreviewMerging;
    private nextAutoMergeThreshold;
    constructor(id: string, options: DownloadOptions, progressCallback: ProgressCallback);
    /**
     * 更新进度状态
     */
    private updateProgress;
    /**
     * 保存任务元数据
     */
    private saveMeta;
    /**
     * 加载任务元数据
     */
    static loadMeta(tempDir: string): TaskMeta | null;
    /**
     * 获取临时目录路径
     */
    static getTempDir(id: string, outputDir: string): string;
    /**
     * 下载 AES-128 密钥
     */
    private downloadKey;
    /**
     * 解密视频分片 (AES-128 CBC)
     */
    private decryptSegment;
    /**
     * 解析错误类型和 HTTP 状态码
     */
    private parseError;
    /**
     * 生成错误排查建议
     */
    private generateErrorHint;
    /**
     * 下载单个分片（带重试，但对 404/403 不重试）
     */
    private downloadSegment;
    /**
     * 执行下载
     */
    download(): Promise<void>;
    /**
     * 取消下载
     */
    cancel(): void;
    /**
     * 暂停下载
     */
    pause(): void;
    /**
     * 继续下载
     */
    resume(): void;
    /**
     * 等待恢复（内部方法）
     */
    private waitForResume;
    /**
     * 获取预览文件列表
     */
    getPreviews(): PreviewFile[];
    /**
     * 手动触发预览合成
     */
    createPreview(mode?: 'temporary' | 'keep'): Promise<PreviewFile | null>;
    /**
     * 检查是否需要自动合成
     */
    private checkAutoMerge;
}
//# sourceMappingURL=downloader.d.ts.map