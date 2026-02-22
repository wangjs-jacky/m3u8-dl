/**
 * 下载器核心模块 - 支持 AES-128 解密
 */
import { DownloadOptions, ProgressCallback } from './types';
/**
 * AES-128 解密下载器
 */
export declare class DecryptingDownloader {
    private id;
    private options;
    private progressCallback;
    private isRunning;
    constructor(id: string, options: DownloadOptions, progressCallback: ProgressCallback);
    /**
     * 更新进度状态
     */
    private updateProgress;
    /**
     * 下载 AES-128 密钥
     */
    private downloadKey;
    /**
     * 解密视频分片 (AES-128 CBC)
     */
    private decryptSegment;
    /**
     * 下载单个分片
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
}
//# sourceMappingURL=downloader.d.ts.map