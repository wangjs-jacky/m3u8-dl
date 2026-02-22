"use strict";
/**
 * 下载器核心模块 - 支持 AES-128 解密
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecryptingDownloader = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const url_1 = require("url");
const parser_1 = require("./parser");
const merger_1 = require("./merger");
const http_1 = require("./http");
/**
 * AES-128 解密下载器
 */
class DecryptingDownloader {
    constructor(id, options, progressCallback) {
        this.isRunning = true;
        this.paused = false;
        this.pausePromise = null;
        this.pauseResolve = null;
        this.id = id;
        this.options = {
            concurrency: 8,
            ...options,
        };
        this.progressCallback = progressCallback;
    }
    /**
     * 更新进度状态
     */
    updateProgress(partial) {
        this.progressCallback({
            ...partial,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * 下载 AES-128 密钥
     */
    async downloadKey(keyUrl) {
        this.updateProgress({
            status: 'downloading_key',
            message: '下载密钥...',
            progress: 10,
        });
        console.log(`[${this.id}] 下载密钥: ${keyUrl}`);
        const data = await (0, http_1.fetchBufferWithProxy)(keyUrl, {
            headers: {
                'Referer': this.options.referer || '',
            },
        });
        console.log(`[${this.id}] 密钥长度: ${data.byteLength} 字节`);
        return data;
    }
    /**
     * 解密视频分片 (AES-128 CBC)
     */
    decryptSegment(encryptedData, key, iv) {
        // IV 格式: 0x... 或直接十六进制字符串
        let ivBuffer;
        if (iv.startsWith('0x') || iv.startsWith('0X')) {
            ivBuffer = Buffer.from(iv.slice(2), 'hex');
        }
        else if (iv) {
            ivBuffer = Buffer.from(iv, 'hex');
        }
        else {
            // 如果没有指定 IV，使用分片索引作为 IV（通常为 0）
            ivBuffer = Buffer.alloc(16, 0);
        }
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuffer);
        decipher.setAutoPadding(true); // PKCS7 padding
        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final(),
        ]);
        return decrypted;
    }
    /**
     * 解析错误类型和 HTTP 状态码
     */
    parseError(errorMsg) {
        // 提取 HTTP 状态码
        const httpMatch = errorMsg.match(/HTTP (\d+)/);
        if (httpMatch) {
            const code = parseInt(httpMatch[1], 10);
            if (code === 403)
                return { code: 403, type: 'forbidden' };
            if (code === 404)
                return { code: 404, type: 'not_found' };
            if (code === 401)
                return { code: 401, type: 'unauthorized' };
            if (code >= 500)
                return { code, type: 'server_error' };
            return { code, type: 'http_error' };
        }
        // 网络错误
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
            return { type: 'network' };
        }
        if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
            return { type: 'timeout' };
        }
        if (errorMsg.includes('proxy') || errorMsg.includes('PROXY')) {
            return { type: 'proxy' };
        }
        return { type: 'unknown' };
    }
    /**
     * 生成错误排查建议
     */
    generateErrorHint(errorStats, sampleErrors) {
        const hints = [];
        if (errorStats.has('forbidden')) {
            hints.push('• 403 禁止访问：可能需要设置正确的 Referer 或 Cookie');
        }
        if (errorStats.has('not_found')) {
            hints.push('• 404 未找到：视频链接可能已过期，请重新获取 m3u8 链接');
        }
        if (errorStats.has('unauthorized')) {
            hints.push('• 401 未授权：需要登录或提供认证信息');
        }
        if (errorStats.has('server_error')) {
            hints.push('• 服务器错误：视频源服务器暂时不可用，请稍后重试');
        }
        if (errorStats.has('timeout')) {
            hints.push('• 连接超时：网络不稳定，请检查网络或降低并发数');
        }
        if (errorStats.has('proxy')) {
            hints.push('• 代理错误：请检查代理设置是否正确');
        }
        if (errorStats.has('network')) {
            hints.push('• 网络错误：无法连接到服务器，请检查网络连接');
        }
        // 添加示例错误
        if (sampleErrors.length > 0) {
            hints.push(`\n示例错误: ${sampleErrors[0]}`);
        }
        return hints.join('\n');
    }
    /**
     * 下载单个分片
     */
    async downloadSegment(segUrl, index, key, iv, tempDir) {
        const filename = `seg_${String(index).padStart(6, '0')}.ts`;
        const filepath = path.join(tempDir, filename);
        try {
            const data = await (0, http_1.fetchBufferWithProxy)(segUrl, {
                headers: {
                    'Referer': this.options.referer || '',
                },
                timeout: 30000,
            });
            // 解密分片
            const decrypted = this.decryptSegment(data, key, iv);
            // 保存解密后的分片
            fs.writeFileSync(filepath, decrypted);
            return { index, success: true };
        }
        catch (error) {
            const errorMsg = error.message || String(error);
            console.error(`[${this.id}] 分片 ${index} 失败: ${errorMsg}`);
            return { index, success: false, error: errorMsg };
        }
    }
    /**
     * 执行下载
     */
    async download() {
        let tempDir = '';
        try {
            // 检查 FFmpeg
            const ffmpegAvailable = await (0, merger_1.checkFFmpeg)();
            if (!ffmpegAvailable) {
                throw new Error('FFmpeg 未安装。请运行: brew install ffmpeg (macOS) 或 sudo apt install ffmpeg (Ubuntu)');
            }
            // 准备输出路径
            let outputPath = this.options.outputPath;
            outputPath = outputPath.replace(/^~/, os.homedir());
            // 如果路径是目录，添加默认文件名
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
                outputPath = path.join(outputPath, 'video.mp4');
            }
            else if (!path.extname(outputPath)) {
                outputPath = path.join(outputPath, 'video.mp4');
            }
            // 确保输出目录存在
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            this.updateProgress({
                status: 'pending',
                message: '解析 M3U8...',
                progress: 5,
            });
            // 解析 M3U8
            console.log(`[${this.id}] 解析 M3U8: ${this.options.url}`);
            const { playlist, baseUrl } = await (0, parser_1.parseM3U8FromUrl)(this.options.url, this.options.referer ? { Referer: this.options.referer } : {});
            console.log(`[${this.id}] M3U8 解析成功`);
            console.log(`[${this.id}] 分片数量: ${playlist.segments.length}`);
            console.log(`[${this.id}] 加密: ${playlist.encryption ? playlist.encryption.method : '无'}`);
            // 检查加密
            if (!playlist.encryption) {
                throw new Error('视频未加密，此下载器仅支持 AES-128 加密视频');
            }
            // 下载密钥
            const keyUrl = playlist.encryption.uri.startsWith('http')
                ? playlist.encryption.uri
                : new url_1.URL(playlist.encryption.uri, baseUrl).href;
            const key = await this.downloadKey(keyUrl);
            const iv = playlist.encryption.iv;
            // 根据时长限制计算分片数
            let segments = [...playlist.segments];
            if (this.options.durationLimit) {
                const maxSegments = Math.ceil((this.options.durationLimit * 60) / playlist.targetDuration);
                segments = segments.slice(0, maxSegments);
                console.log(`[${this.id}] 时长限制 ${this.options.durationLimit} 分钟，下载前 ${segments.length} 个分片`);
            }
            // 创建临时目录
            tempDir = path.join(outputDir, `.temp_segments_${this.id}`);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            console.log(`[${this.id}] 临时目录: ${tempDir}`);
            this.updateProgress({
                status: 'downloading',
                message: `开始下载 ${segments.length} 个分片...`,
                progress: 15,
            });
            // 并发下载分片
            const concurrency = this.options.concurrency || 8;
            const downloaded = [];
            const errorStats = new Map();
            const sampleErrors = [];
            let completed = 0;
            // 分批下载
            for (let i = 0; i < segments.length; i += concurrency) {
                await this.waitForResume();
                if (!this.isRunning) {
                    throw new Error('下载已取消');
                }
                const batch = segments.slice(i, Math.min(i + concurrency, segments.length));
                const promises = batch.map((seg) => {
                    const segUrl = seg.uri.startsWith('http')
                        ? seg.uri
                        : new url_1.URL(seg.uri, baseUrl).href;
                    return this.downloadSegment(segUrl, seg.index, key, iv, tempDir);
                });
                const results = await Promise.all(promises);
                for (const result of results) {
                    completed++;
                    if (result.success) {
                        const filename = `seg_${String(result.index).padStart(6, '0')}.ts`;
                        downloaded.push({ index: result.index, file: path.join(tempDir, filename) });
                    }
                    else if (result.error) {
                        // 收集错误统计
                        const { type } = this.parseError(result.error);
                        errorStats.set(type, (errorStats.get(type) || 0) + 1);
                        if (sampleErrors.length < 3) {
                            sampleErrors.push(result.error);
                        }
                    }
                    const progress = 15 + Math.floor((completed / segments.length) * 80);
                    this.updateProgress({
                        status: 'downloading',
                        message: `下载中 ${completed}/${segments.length}`,
                        progress,
                    });
                }
            }
            // 检查是否有成功下载的分片
            if (downloaded.length === 0) {
                const errorHint = this.generateErrorHint(errorStats, sampleErrors);
                const failedCount = completed;
                throw new Error(`所有 ${failedCount} 个分片下载失败。\n\n排查建议:\n${errorHint}`);
            }
            // 排序并获取文件列表
            downloaded.sort((a, b) => a.index - b.index);
            const segmentFiles = downloaded.map((d) => d.file);
            this.updateProgress({
                status: 'merging',
                message: '合并视频中...',
                progress: 95,
            });
            // 合并视频
            await (0, merger_1.mergeSegments)({
                segmentFiles,
                outputPath,
                tempDir,
            });
            const fileSize = fs.statSync(outputPath).size;
            this.updateProgress({
                status: 'completed',
                message: `下载完成! 大小: ${(fileSize / 1024 / 1024).toFixed(1)} MB`,
                progress: 100,
            });
            console.log(`[${this.id}] 下载完成: ${outputPath}`);
        }
        catch (error) {
            console.error(`[${this.id}] 错误:`, error);
            this.updateProgress({
                status: 'error',
                error: error.message,
                message: error.message,
                progress: 0,
            });
            throw error;
        }
        finally {
            // 清理临时目录
            if (tempDir && fs.existsSync(tempDir)) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    console.log(`[${this.id}] 已清理临时目录: ${tempDir}`);
                }
                catch (e) {
                    console.error(`[${this.id}] 清理临时目录失败:`, e);
                }
            }
        }
    }
    /**
     * 取消下载
     */
    cancel() {
        this.isRunning = false;
    }
    /**
     * 暂停下载
     */
    pause() {
        if (this.paused) {
            return; // 防止重复暂停
        }
        this.paused = true;
        this.pausePromise = new Promise(resolve => {
            this.pauseResolve = resolve;
        });
    }
    /**
     * 继续下载
     */
    resume() {
        if (!this.paused) {
            return; // 防止重复恢复
        }
        this.paused = false;
        if (this.pauseResolve) {
            this.pauseResolve();
            this.pauseResolve = null;
            this.pausePromise = null;
        }
    }
    /**
     * 等待恢复（内部方法）
     */
    async waitForResume() {
        if (this.paused && this.pausePromise) {
            await this.pausePromise;
        }
    }
}
exports.DecryptingDownloader = DecryptingDownloader;
//# sourceMappingURL=downloader.js.map