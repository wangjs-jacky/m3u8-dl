# Chrome 视频嗅探扩展设计文档

## 概述

开发一个 Chrome 浏览器扩展，自动嗅探网页中的视频资源（M3U8/MP4），支持一键跳转到本地下载器进行下载。

## 技术栈

- **框架**: Plasmo（Chrome MV3 扩展框架）
- **语言**: TypeScript
- **UI**: React
- **API**: chrome.webRequest, chrome.storage, chrome.tabs

## 项目结构

```
packages/video-sniffer/
├── package.json
├── plasmo.config.ts       # Plasmo 配置
├── tsconfig.json
├── src/
│   ├── background.ts      # Service Worker - 拦截网络请求
│   ├── popup.tsx          # React 弹窗组件
│   ├── popup.css          # 样式
│   ├── types.ts           # 类型定义
│   └── assets/            # 图标等资源
│       └── icon-*.png
└── README.md
```

## 核心模块

### 1. background.ts - 网络请求拦截

使用 `chrome.webRequest.onCompleted` API 监听所有网络请求，过滤出 M3U8 和 MP4 链接。

```typescript
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = details.url
    if (url.match(/\.(m3u8|mp4)(\?|$)/i)) {
      saveVideoUrl(url, details)
    }
  },
  { urls: ["<all_urls>"] }
)
```

### 2. popup.tsx - 嗅探结果展示

- 从 `chrome.storage.local` 读取捕获的视频列表
- 显示 URL、类型（M3U8/MP4）、捕获时间、来源页面
- 提供"复制链接"和"一键下载"按钮

### 3. 数据结构

```typescript
interface VideoItem {
  id: string            // 唯一标识
  url: string           // 视频 URL
  type: 'm3u8' | 'mp4'  // 类型
  pageUrl: string       // 捕获时的页面 URL
  pageTitle: string     // 页面标题
  timestamp: number     // 捕获时间戳
}
```

## 一键下载实现

点击下载按钮时，打开新标签页跳转到本地下载器：

```typescript
const handleDownload = (url: string) => {
  const downloaderUrl = `http://localhost:5001/?url=${encodeURIComponent(url)}`
  chrome.tabs.create({ url: downloaderUrl })
}
```

## 权限配置

```json
{
  "permissions": [
    "webRequest",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

## 附加功能

- [x] 清空列表
- [x] 按域名过滤
- [x] URL 去重
- [ ] 导出为文本/JSON（可选）

## 与现有项目集成

扩展捕获视频链接后，跳转到 `localhost:5001`（现有的 m3u8-dl 服务），URL 自动填入下载框。

## 浏览器支持

- Chrome（主要目标）
- Edge（兼容）
