/**
 * 视频合并模块 - 使用 spawn 调用 ffmpeg
 */
import { MergeOptions, IncrementalMergeOptions } from './types';
/**
 * 使用 FFmpeg 合并视频分片
 */
export declare function mergeSegments(options: MergeOptions): Promise<void>;
/**
 * 检查 FFmpeg 是否可用
 */
export declare function checkFFmpeg(): Promise<boolean>;
/**
 * 收集目录中的所有分片文件
 */
export declare function collectSegmentFiles(dirPath: string): string[];
/**
 * 增量合并 - 合并多个分片部分为一个预览文件
 */
export declare function mergeSegmentsIncremental(options: IncrementalMergeOptions): Promise<string>;
/**
 * 估算视频时长（基于分片数和平均分片时长）
 */
export declare function estimateDuration(segmentCount: number, avgSegmentDuration?: number): string;
//# sourceMappingURL=merger.d.ts.map