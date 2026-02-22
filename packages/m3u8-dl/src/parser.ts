/**
 * M3U8 播放列表解析模块
 */

// @ts-ignore - m3u8-parser 没有类型定义
import { Parser } from 'm3u8-parser';
import { ParsedPlaylist, EncryptionInfo, SegmentInfo } from './types';
import { fetchWithProxy } from './http';

/**
 * 解析 M3U8 播放列表内容
 */
export function parseM3U8(content: string): ParsedPlaylist {
  const parser = new Parser();
  parser.push(content);
  parser.end();

  const manifest = parser.manifest;

  if (!manifest.segments || manifest.segments.length === 0) {
    throw new Error('M3U8 播放列表中没有找到视频分片');
  }

  // 提取加密信息
  let encryption: EncryptionInfo | null = null;
  if (manifest.contentProtection) {
    // 处理内容保护（DRM）
    console.log('[Parser] 检测到内容保护，但仅支持 AES-128');
  }

  // 从 segments 中提取加密信息（AES-128 通常在分片级别）
  const firstSegment = manifest.segments[0];
  if (firstSegment.key) {
    // 处理 IV 格式：m3u8-parser 返回 Uint32Array，需要转换为十六进制字符串
    let ivStr = '';
    const iv: any = firstSegment.key.iv;
    if (iv) {
      if (typeof iv === 'string') {
        ivStr = iv;
      } else if (iv instanceof Uint32Array) {
        // 将 Uint32Array 转换为十六进制字符串
        const hexBytes: string[] = [];
        const view = new DataView(iv.buffer);
        for (let i = 0; i < 16; i++) {
          hexBytes.push(view.getUint8(i).toString(16).padStart(2, '0'));
        }
        ivStr = '0x' + hexBytes.join('');
      }
    }

    encryption = {
      method: firstSegment.key.method || 'AES-128',
      uri: firstSegment.key.uri || '',
      iv: ivStr,
    };
    console.log(`[Parser] 加密方法: ${encryption.method}`);
    console.log(`[Parser] 密钥 URI: ${encryption.uri}`);
    console.log(`[Parser] IV: ${ivStr}`);
  }

  // 提取分片信息
  const segments: SegmentInfo[] = manifest.segments.map((seg: any, index: number) => ({
    uri: seg.uri,
    duration: seg.duration || manifest.targetDuration || 5,
    index,
  }));

  const targetDuration = manifest.targetDuration || 5;

  console.log(`[Parser] 解析完成: ${segments.length} 个分片, 目标时长: ${targetDuration}s`);

  return {
    targetDuration,
    segments,
    encryption,
  };
}

/**
 * 解析 M3U8 URL 并返回解析结果
 */
export async function parseM3U8FromUrl(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ playlist: ParsedPlaylist; baseUrl: string }> {
  const { data } = await fetchWithProxy(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ...headers,
    },
    timeout: 30000,
  });

  const playlist = parseM3U8(data);

  // 计算基础 URL（用于拼接分片 URL）
  const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

  return { playlist, baseUrl };
}
