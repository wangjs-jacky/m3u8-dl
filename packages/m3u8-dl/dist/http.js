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
 * 获取代理 Agent
 */
function getProxyAgent() {
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
    const agent = getProxyAgent();
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
    const agent = getProxyAgent();
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
 * 创建配置好的 axios 实例（不使用代理，用于非代理场景）
 */
function createAxiosInstance(options = {}) {
    const agent = getProxyAgent();
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