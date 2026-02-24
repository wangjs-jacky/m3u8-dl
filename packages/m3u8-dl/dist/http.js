"use strict";
/**
 * 共享的 HTTP 客户端配置
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultAxios = void 0;
exports.getProxyAgent = getProxyAgent;
exports.fetchWithProxy = fetchWithProxy;
exports.fetchBufferWithProxy = fetchBufferWithProxy;
exports.createAxiosInstance = createAxiosInstance;
const axios_1 = __importDefault(require("axios"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const socks_proxy_agent_1 = require("socks-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
/**
 * 检查 URL 是否应该绕过代理
 */
function shouldBypassProxy(url) {
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
    if (!noProxy) {
        return false;
    }
    const noProxyItems = noProxy.split(',').map(s => s.trim());
    const hostname = new URL(url).hostname;
    for (const item of noProxyItems) {
        // 完全匹配
        if (item === hostname) {
            return true;
        }
        // 域名匹配（如 .example.com 匹配 foo.example.com）
        if (item.startsWith('.') && hostname.endsWith(item.substring(1))) {
            return true;
        }
        // 域名后缀匹配
        if (hostname.endsWith('.' + item)) {
            return true;
        }
        // 通配符匹配
        if (item === '*') {
            return true;
        }
    }
    return false;
}
/**
 * 获取代理 Agent
 */
function getProxyAgent(targetUrl) {
    // 如果提供了目标 URL，检查是否应该绕过代理
    if (targetUrl && shouldBypassProxy(targetUrl)) {
        console.log(`[Proxy] 绕过代理: ${targetUrl}`);
        return undefined;
    }
    const proxyUrl = process.env.ALL_PROXY ||
        process.env.all_proxy ||
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy;
    if (!proxyUrl) {
        return undefined;
    }
    console.log(`[Proxy] 检测到代理: ${proxyUrl}`);
    // SOCKS 代理
    if (proxyUrl.startsWith('socks')) {
        return new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
    }
    // HTTP/HTTPS 代理
    if (proxyUrl.startsWith('http')) {
        return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
    }
    return undefined;
}
/**
 * 使用 fetch 发送请求（支持 SOCKS 代理）
 */
async function fetchWithProxy(url, options = {}) {
    const agent = getProxyAgent(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);
    try {
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                ...options.headers,
            },
            signal: controller.signal,
        };
        if (agent) {
            fetchOptions.agent = agent;
        }
        const response = await (0, node_fetch_1.default)(url, fetchOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.text();
        return { data, status: response.status };
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * 使用 fetch 下载二进制数据（支持 SOCKS 代理）
 */
async function fetchBufferWithProxy(url, options = {}) {
    const agent = getProxyAgent(url);
    const timeout = options.timeout || 30000;
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                ...options.headers,
            },
        };
        if (agent) {
            fetchOptions.agent = agent;
        }
        (0, node_fetch_1.default)(url, fetchOptions)
            .then((response) => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
            .then((arrayBuffer) => {
            resolve(Buffer.from(arrayBuffer));
        })
            .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}
/**
 * 创建配置好的 axios 实例（支持代理和 NO_PROXY）
 */
function createAxiosInstance(options = {}) {
    const agent = getProxyAgent(options.targetUrl);
    return axios_1.default.create({
        timeout: 30000,
        maxRedirects: 0,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': options.referer || '',
            'Origin': options.origin || '',
        },
        httpAgent: agent,
        httpsAgent: agent,
    });
}
// 全局默认 axios 实例
exports.defaultAxios = createAxiosInstance();
//# sourceMappingURL=http.js.map