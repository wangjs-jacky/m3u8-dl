/**
 * 视频合并模块 - 使用 spawn 调用 ffmpeg
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { MergeOptions, IncrementalMergeOptions } from './types';

/**
 * 使用 FFmpeg 合并视频分片
 */
export async function mergeSegments(options: MergeOptions): Promise<void> {
  const { segmentFiles, outputPath, tempDir } = options;

  // 创建分片列表文件
  const listFile = path.join(tempDir, 'segments.txt');
  const listContent = segmentFiles
    .map((file) => `file '${path.basename(file)}'`)
    .join('\n');

  fs.writeFileSync(listFile, listContent, 'utf-8');
  console.log(`[Merger] 创建分片列表: ${listFile}`);
  console.log(`[Merger] 分片数量: ${segmentFiles.length}`);

  // 临时 TS 文件路径
  const tsFile = outputPath.replace(/\.mp4$/i, '.ts');

  try {
    // 步骤 1: 使用 FFmpeg concat 协议合并为 TS
    console.log('[Merger] 使用 FFmpeg 合并分片...');
    await runFFmpegConcat(listFile, tsFile, tempDir);

    // 步骤 2: 转换为 MP4
    console.log('[Merger] 转换为 MP4...');
    await runFFmpegConvert(tsFile, outputPath);

    // 清理临时 TS 文件
    if (fs.existsSync(tsFile)) {
      fs.unlinkSync(tsFile);
      console.log(`[Merger] 已删除临时文件: ${tsFile}`);
    }

    const fileSize = fs.statSync(outputPath).size;
    console.log(`[Merger] 合并完成! 文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error('[Merger] FFmpeg 合并失败:', error);
    console.log('[Merger] 尝试二进制合并...');

    // 备选方案: 二进制合并
    await binaryMerge(segmentFiles, outputPath);
  }
}

/**
 * 执行 FFmpeg concat 命令
 */
function runFFmpegConcat(listFile: string, outputFile: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', path.basename(listFile),
      '-c', 'copy',
      '-y',
      outputFile,
    ];

    console.log(`[Merger] 执行: ffmpeg ${args.join(' ')}`);

    const proc = spawn('ffmpeg', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg concat 失败 (code ${code}): ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 执行失败: ${err.message}`));
    });
  });
}

/**
 * 执行 FFmpeg 转换命令 (TS -> MP4)
 */
function runFFmpegConvert(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-i', inputFile,
      '-c', 'copy',
      '-movflags', 'faststart',
      '-y',
      outputFile,
    ];

    console.log(`[Merger] 执行: ffmpeg ${args.join(' ')}`);

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg 转换失败 (code ${code}): ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 执行失败: ${err.message}`));
    });
  });
}

/**
 * 二进制合并（备选方案）
 */
async function binaryMerge(segmentFiles: string[], outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const writeStream = fs.createWriteStream(outputFile);

      for (const file of segmentFiles) {
        if (fs.existsSync(file)) {
          const data = fs.readFileSync(file);
          writeStream.write(data);
        } else {
          console.warn(`[Merger] 警告: 分片文件不存在 ${file}`);
        }
      }

      writeStream.end();
      console.log('[Merger] 二进制合并完成');

      const fileSize = fs.statSync(outputFile).size;
      console.log(`[Merger] 文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 检查 FFmpeg 是否可用
 */
export function checkFFmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * 收集目录中的所有分片文件
 */
export function collectSegmentFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.ts'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return numA - numB;
    });

  return files.map(f => path.join(dirPath, f));
}

/**
 * 增量合并 - 合并多个分片部分为一个预览文件
 */
export async function mergeSegmentsIncremental(
  options: IncrementalMergeOptions
): Promise<string> {
  const { parts, outputPath, tempDir, previewDir } = options;

  // 确保预览目录存在
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  // 收集所有分片文件
  const allSegmentFiles: string[] = [];
  for (const part of parts) {
    const files = collectSegmentFiles(part.dirPath);
    allSegmentFiles.push(...files);
  }

  if (allSegmentFiles.length === 0) {
    throw new Error('没有可合并的分片');
  }

  console.log(`[Merger] 增量合并 ${parts.length} 个部分，共 ${allSegmentFiles.length} 个分片`);

  // 创建临时合并目录
  const mergeTempDir = path.join(tempDir, `merge_${Date.now()}`);
  fs.mkdirSync(mergeTempDir, { recursive: true });

  try {
    // 创建分片列表文件（使用绝对路径）
    const listFile = path.join(mergeTempDir, 'segments.txt');
    const listContent = allSegmentFiles
      .map((file) => `file '${file}'`)
      .join('\n');
    fs.writeFileSync(listFile, listContent, 'utf-8');

    // 临时 TS 文件
    const tsFile = path.join(mergeTempDir, 'preview.ts');

    // 步骤 1: 合并为 TS
    await runFFmpegConcatAbsolute(listFile, tsFile);

    // 步骤 2: 转换为 MP4
    await runFFmpegConvert(tsFile, outputPath);

    // 清理临时文件
    fs.rmSync(mergeTempDir, { recursive: true, force: true });

    const fileSize = fs.statSync(outputPath).size;
    console.log(`[Merger] 增量合并完成! 文件: ${outputPath}, 大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    return outputPath;
  } catch (error) {
    // 清理临时文件
    if (fs.existsSync(mergeTempDir)) {
      fs.rmSync(mergeTempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * 执行 FFmpeg concat 命令（使用绝对路径）
 */
function runFFmpegConcatAbsolute(listFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      '-y',
      outputFile,
    ];

    console.log(`[Merger] 执行: ffmpeg ${args.join(' ')}`);

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg concat 失败 (code ${code}): ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 执行失败: ${err.message}`));
    });
  });
}

/**
 * 估算视频时长（基于分片数和平均分片时长）
 */
export function estimateDuration(segmentCount: number, avgSegmentDuration: number = 6): string {
  const totalSeconds = segmentCount * avgSegmentDuration;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
