# Video Sniffer - Chrome 视频嗅探扩展

自动嗅探网页中的视频资源（M3U8/MP4），支持一键跳转到本地下载器。

## 功能

- 自动捕获页面中的 M3U8 和 MP4 视频链接
- 实时显示捕获的视频列表
- 按类型过滤（M3U8/MP4/当前页面）
- 一键复制链接
- 一键下载（跳转到本地下载器）
- URL 去重

## 安装

### 开发模式

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 打包为 .crx
npm run package
```

### 加载扩展

1. 运行 `npm run build`
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `build/chrome-mv3-prod` 目录

## 使用方法

1. 浏览包含视频的网页
2. 点击扩展图标查看捕获的视频列表
3. 点击「下载」按钮跳转到本地下载器（需先启动 m3u8-dl 服务）

## 配合 m3u8-dl 使用

1. 启动本地下载器服务：
   ```bash
   npm run server
   ```

2. 服务运行在 `http://localhost:5001`

3. 点击扩展中的「下载」按钮会自动跳转到下载器页面

## 技术栈

- [Plasmo](https://www.plasmo.com/) - Chrome 扩展框架
- React + TypeScript
- chrome.webRequest API

## 权限说明

| 权限 | 用途 |
|------|------|
| webRequest | 拦截网络请求，捕获视频 URL |
| storage | 存储捕获的视频列表 |
| tabs | 获取页面信息，打开下载页面 |
| host_permissions | 监听所有网站的请求 |
