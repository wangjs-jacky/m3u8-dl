// 画质信息
export interface QualityInfo {
  height?: number       // 分辨率高度 (如 1080, 720, 480)
  bandwidth?: number    // 带宽 (bps)
  label?: string        // 画质标签 (如 "1080p", "高清")
}

// 视频项类型
export interface VideoItem {
  id: string            // 唯一标识
  url: string           // 视频 URL
  type: 'm3u8'          // 类型（只支持 m3u8）
  pageUrl: string       // 捕获时的页面 URL
  pageTitle: string     // 页面标题
  timestamp: number     // 捕获时间戳
  tabId: number         // 所属标签页 ID
  quality?: QualityInfo // 画质信息
  groupId?: string      // 分组 ID（同一视频的不同画质共享）
}

// 存储结构
export interface StorageData {
  videos: VideoItem[]
}

// 过滤选项
export type FilterType = 'all' | 'currentTab' | 'bestQuality'
