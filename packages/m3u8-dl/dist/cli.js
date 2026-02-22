#!/usr/bin/env node
"use strict";
/**
 * M3U8 视频下载器 CLI
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
const cac_1 = require("cac");
const os = __importStar(require("os"));
const downloader_1 = require("./downloader");
// 生成唯一 ID
function generateId() {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
// 格式化进度条
function formatProgress(progress, width = 40) {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
}
async function main() {
    const cli = (0, cac_1.cac)('m3u8-dl');
    cli
        .version('1.0.0')
        .usage('<url> [options]')
        .example('m3u8-dl https://example.com/video.m3u8 -o video.mp4')
        .example('m3u8-dl https://example.com/video.m3u8 -o ~/Downloads/video.mp4 --referer https://example.com')
        .example('m3u8-dl https://example.com/video.m3u8 -o video.mp4 --duration 5');
    cli
        .option('-o, --output <path>', '输出文件路径', { default: './video.mp4' })
        .option('-r, --referer <url>', 'Referer 请求头')
        .option('-c, --concurrency <number>', '并发下载数', { default: 8 })
        .option('-d, --duration <minutes>', '下载时长限制（分钟）');
    const { args, options } = cli.parse();
    if (!args[0]) {
        cli.outputHelp();
        process.exit(1);
    }
    const url = args[0];
    const outputPath = options.output.replace(/^~/, os.homedir());
    const referer = options.referer;
    const concurrency = parseInt(options.concurrency, 10) || 8;
    const durationLimit = options.duration ? parseInt(options.duration, 10) : undefined;
    console.log('');
    console.log('='.repeat(50));
    console.log('  M3U8 视频下载器');
    console.log('='.repeat(50));
    console.log(`  URL:    ${url}`);
    console.log(`  输出:   ${outputPath}`);
    console.log(`  并发:   ${concurrency}`);
    if (referer)
        console.log(`  Referer: ${referer}`);
    if (durationLimit)
        console.log(`  时长限制: ${durationLimit} 分钟`);
    console.log('='.repeat(50));
    console.log('');
    const id = generateId();
    // 进度回调
    let lastProgress = -1;
    const onProgress = (state) => {
        if (state.progress !== undefined && state.progress !== lastProgress) {
            lastProgress = state.progress;
            const bar = formatProgress(state.progress);
            const message = state.message || '';
            process.stdout.write(`\r${bar} ${message}`.padEnd(80));
        }
    };
    try {
        const downloader = new downloader_1.DecryptingDownloader(id, {
            url,
            outputPath,
            referer,
            concurrency,
            durationLimit,
        }, onProgress);
        // 处理 Ctrl+C
        process.on('SIGINT', () => {
            console.log('\n\n取消下载...');
            downloader.cancel();
            process.exit(0);
        });
        await downloader.download();
        console.log('\n');
        console.log('✅ 下载完成!');
        console.log(`   文件: ${outputPath}`);
    }
    catch (error) {
        console.log('\n');
        console.error('❌ 下载失败:', error.message);
        process.exit(1);
    }
}
main().catch((error) => {
    console.error('程序错误:', error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map