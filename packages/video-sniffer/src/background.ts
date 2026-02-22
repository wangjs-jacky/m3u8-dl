import type { VideoItem, StorageData } from './types'

// 生成唯一 ID
const generateId = () => Math.random().toString(36).substring(2, 15)

// 获取视频类型
const getVideoType = (url: string): 'm3u8' | 'mp4' | null => {
  if (/\.m3u8(\?|$)/i.test(url)) return 'm3u8'
  if (/\.mp4(\?|$)/i.test(url)) return 'mp4'
  return null
}

// 保存视频 URL
const saveVideoUrl = async (url: string, details: chrome.webRequest.WebResponseCacheDetails) => {
  const type = getVideoType(url)
  if (!type) return

  // 获取当前标签页信息
  const tab = await chrome.tabs.get(details.tabId).catch(() => null)

  const newItem: VideoItem = {
    id: generateId(),
    url,
    type,
    pageUrl: tab?.url || '',
    pageTitle: tab?.title || '',
    timestamp: Date.now()
  }

  // 从 storage 读取现有数据
  const data = await chrome.storage.local.get('videos') as StorageData
  const videos = data.videos || []

  // 去重：检查 URL 是否已存在
  const exists = videos.some(v => v.url === url)
  if (exists) return

  // 添加新项并保存（最多保留 100 条）
  const updatedVideos = [newItem, ...videos].slice(0, 100)
  await chrome.storage.local.set({ videos: updatedVideos })

  // 更新扩展图标 badge
  chrome.action.setBadgeText({ text: updatedVideos.length.toString() })
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })
}

// 监听所有网络请求
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = details.url
    const type = getVideoType(url)
    if (type) {
      saveVideoUrl(url, details)
    }
  },
  { urls: ['<all_urls>'] }
)

// 监听标签页更新，清除 badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    // 可选：页面加载时重置状态
  }
})

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ videos: [] })
  chrome.action.setBadgeText({ text: '' })
})

export {}
