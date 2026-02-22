// 视频项类型
export interface VideoItem {
  id: string            // 唯一标识
  url: string           // 视频 URL
  type: 'm3u8' | 'mp4'  // 类型
  pageUrl: string       // 捕获时的页面 URL
  pageTitle: string     // 页面标题
  timestamp: number     // 捕获时间戳
}

// 存储结构
export interface StorageData {
  videos: VideoItem[]
}

// 过滤选项
export type FilterType = 'all' | 'm3u8' | 'mp4' | 'currentTab'
