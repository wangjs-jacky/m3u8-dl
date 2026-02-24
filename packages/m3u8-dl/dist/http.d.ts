/**
 * 共享的 HTTP 客户端配置
 */
import { AxiosInstance } from 'axios';
/**
 * 获取代理 Agent
 */
export declare function getProxyAgent(targetUrl?: string): any;
/**
 * 使用 fetch 发送请求（支持 SOCKS 代理）
 */
export declare function fetchWithProxy(url: string, options?: {
    headers?: Record<string, string>;
    timeout?: number;
}): Promise<{
    data: string;
    status: number;
}>;
/**
 * 使用 fetch 下载二进制数据（支持 SOCKS 代理）
 */
export declare function fetchBufferWithProxy(url: string, options?: {
    headers?: Record<string, string>;
    timeout?: number;
}): Promise<Buffer>;
/**
 * 创建配置好的 axios 实例（支持代理和 NO_PROXY）
 */
export declare function createAxiosInstance(options?: {
    referer?: string;
    origin?: string;
    targetUrl?: string;
}): AxiosInstance;
export declare const defaultAxios: AxiosInstance;
//# sourceMappingURL=http.d.ts.map