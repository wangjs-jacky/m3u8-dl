/**
 * 视频合并模块 - 使用 spawn 调用 ffmpeg
 */
import { MergeOptions } from './types';
/**
 * 使用 FFmpeg 合并视频分片
 */
export declare function mergeSegments(options: MergeOptions): Promise<void>;
/**
 * 检查 FFmpeg 是否可用
 */
export declare function checkFFmpeg(): Promise<boolean>;
//# sourceMappingURL=merger.d.ts.map