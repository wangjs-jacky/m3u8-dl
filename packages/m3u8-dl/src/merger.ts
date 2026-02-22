/**
 * 视频合并模块 - 使用 spawn 调用 ffmpeg
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { MergeOptions } from './types';

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
