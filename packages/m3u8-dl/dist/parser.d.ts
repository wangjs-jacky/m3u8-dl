/**
 * M3U8 播放列表解析模块
 */
import { ParsedPlaylist } from './types';
/**
 * 解析 M3U8 播放列表内容
 */
export declare function parseM3U8(content: string): ParsedPlaylist;
/**
 * 解析 M3U8 URL 并返回解析结果
 */
export declare function parseM3U8FromUrl(url: string, headers?: Record<string, string>): Promise<{
    playlist: ParsedPlaylist;
    baseUrl: string;
}>;
//# sourceMappingURL=parser.d.ts.map