import type { VideoItem, StorageData, QualityInfo } from './types'

// 生成唯一 ID
const generateId = () => Math.random().toString(36).substring(2, 15)

// 检查是否为 m3u8 URL
const isM3U8 = (url: string): boolean => {
  return /\.m3u8(\?|$)/i.test(url)
}

// 从 URL 中解析画质信息
const parseQualityFromUrl = (url: string): QualityInfo => {
  const quality: QualityInfo = {}

  // 常见分辨率模式
  const resolutionPatterns = [
    // 标准: 1080p, 720p, 480p, 360p
    /[_\-.\/](\d{3,4})p[_\-.\/]?/i,
    // 带 k: 4k, 2k, 8k
    /[_\-.\/](\d)k[_\-.\/]?/i,
    // 分辨率: 1920x1080, 1280x720
    /(\d{3,4})x(\d{3,4})/i,
    // 超清/高清/标清/蓝光等中文标识
    /[_\-.\/](超清|高清|标清|蓝光|原画|极速|流畅|高清_?1080[Pp]?|高清_?720[Pp]?)/i,
    // 英文标识
    /[_\-.\/](4k|uhd|fhd|hd|sd|high|medium|low|best|worst|source|original)/i,
    // 数字高度: h1080, h720
    /[_\-.\/]h(\d{3,4})[_\-.\/]?/i,
    // 带宽 (bps)
    /[_\-.\/](\d+)k?bps/i,
  ]

  // 解析分辨率高度
  const heightMatch = url.match(resolutionPatterns[0])
  if (heightMatch) {
    quality.height = parseInt(heightMatch[1])
    quality.label = `${heightMatch[1]}p`
  }

  // 解析 k 分辨率
  const kMatch = url.match(resolutionPatterns[1])
  if (kMatch) {
    const kValue = parseInt(kMatch[1])
    if (kValue === 4) {
      quality.height = 2160
      quality.label = '4K'
    } else if (kValue === 2) {
      quality.height = 1440
      quality.label = '2K'
    } else if (kValue === 8) {
      quality.height = 4320
      quality.label = '8K'
    }
  }

  // 解析 WxH 格式
  const whMatch = url.match(resolutionPatterns[2])
  if (whMatch) {
    quality.height = parseInt(whMatch[2])
    quality.label = `${whMatch[2]}p`
  }

  // 解析中文画质标识
  const cnMatch = url.match(resolutionPatterns[3])
  if (cnMatch) {
    const label = cnMatch[1].toLowerCase()
    if (label.includes('1080') || label.includes('蓝光') || label.includes('原画')) {
      quality.height = 1080
      quality.label = cnMatch[1]
    } else if (label.includes('720') || label.includes('超清')) {
      quality.height = 720
      quality.label = cnMatch[1]
    } else if (label.includes('高清')) {
      quality.height = 540
      quality.label = cnMatch[1]
    } else if (label.includes('标清') || label.includes('流畅')) {
      quality.height = 360
      quality.label = cnMatch[1]
    }
  }

  // 解析英文标识
  const enMatch = url.match(resolutionPatterns[4])
  if (enMatch) {
    const label = enMatch[1].toLowerCase()
    const labelMap: Record<string, { height: number; label: string }> = {
      '4k': { height: 2160, label: '4K' },
      'uhd': { height: 2160, label: 'UHD' },
      'fhd': { height: 1080, label: 'FHD' },
      'hd': { height: 720, label: 'HD' },
      'sd': { height: 480, label: 'SD' },
      'high': { height: 1080, label: 'High' },
      'medium': { height: 720, label: 'Medium' },
      'low': { height: 480, label: 'Low' },
      'best': { height: 1080, label: 'Best' },
      'worst': { height: 360, label: 'Worst' },
      'source': { height: 1080, label: 'Source' },
      'original': { height: 1080, label: 'Original' },
    }
    if (labelMap[label]) {
      quality.height = labelMap[label].height
      quality.label = labelMap[label].label
    }
  }

  // 解析 h123 格式
  const hMatch = url.match(resolutionPatterns[5])
  if (hMatch) {
    quality.height = parseInt(hMatch[1])
    quality.label = `${hMatch[1]}p`
  }

  // 解析带宽
  const bpsMatch = url.match(resolutionPatterns[6])
  if (bpsMatch) {
    quality.bandwidth = parseInt(bpsMatch[1]) * (bpsMatch[1].includes('k') ? 1000 : 1)
  }

  return quality
}

// 生成视频分组 ID（基于 URL 相似性）
const generateGroupId = (url: string): string => {
  try {
    const urlObj = new URL(url)
    // 使用域名 + 路径基础部分作为分组依据
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    // 移除可能的分辨率相关部分
    const basePath = pathParts
      .filter(p => !/\d{3,4}p|4k|8k|hd|sd|高清|超清|标清/i.test(p))
      .slice(0, -1) // 移除最后一部分（通常是文件名）
      .join('/')
    return `${urlObj.hostname}/${basePath}`
  } catch {
    return url.split('?')[0].split('/').slice(0, -1).join('/')
  }
}

// 更新 badge（显示当前活跃 tab 的视频数量）
const updateBadge = async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!activeTab?.id) return

  const data = await chrome.storage.local.get('videos') as StorageData
  const videos = data.videos || []
  const currentTabCount = videos.filter(v => v.tabId === activeTab.id).length

  chrome.action.setBadgeText({ text: currentTabCount > 0 ? currentTabCount.toString() : '' })
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })
}

// 保存视频 URL（只处理 m3u8，智能去重）
const saveVideoUrl = async (url: string, details: chrome.webRequest.WebResponseCacheDetails) => {
  if (!isM3U8(url)) return

  const tabId = details.tabId
  // 忽略非网页请求（如扩展自己的请求）
  if (tabId < 0) return

  // 获取当前标签页信息
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab) return

  // 解析画质信息
  const quality = parseQualityFromUrl(url)
  const groupId = generateGroupId(url)

  // 从 storage 读取现有数据
  const data = await chrome.storage.local.get('videos') as StorageData
  const videos = data.videos || []

  // 智能去重：查找同 URL 的记录
  const existingIndex = videos.findIndex(v => v.url === url)

  if (existingIndex !== -1) {
    // 同 URL 存在：更新为最新记录（新 tabId、新 timestamp）
    videos[existingIndex] = {
      ...videos[existingIndex],
      tabId,
      pageUrl: tab.url || '',
      pageTitle: tab.title || '',
      timestamp: Date.now(),
      quality,
      groupId
    }
  } else {
    // 新 URL：添加到数组开头
    const newItem: VideoItem = {
      id: generateId(),
      url,
      type: 'm3u8',
      pageUrl: tab.url || '',
      pageTitle: tab.title || '',
      timestamp: Date.now(),
      tabId,
      quality,
      groupId
    }
    videos.unshift(newItem)
  }

  // 保存（限制总数量，避免无限增长）
  const updatedVideos = videos.slice(0, 200)
  await chrome.storage.local.set({ videos: updatedVideos })

  // 更新 badge
  updateBadge()
}

// 监听所有网络请求（只捕获 m3u8）
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (isM3U8(details.url)) {
      saveVideoUrl(details.url, details)
    }
  },
  { urls: ['<all_urls>'] }
)

// Tab 关闭时清理该 tab 的视频数据
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get('videos') as StorageData
  const videos = data.videos || []

  // 过滤掉该 tab 的所有记录
  const updatedVideos = videos.filter(v => v.tabId !== tabId)

  await chrome.storage.local.set({ videos: updatedVideos })
  updateBadge()
})

// Tab 切换时更新 badge
chrome.tabs.onActivated.addListener(updateBadge)

// Tab 更新时更新 badge（页面导航后）
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    updateBadge()
  }
})

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ videos: [] })
  chrome.action.setBadgeText({ text: '' })
})

// 扩展启动时也更新一次 badge
chrome.runtime.onStartup.addListener(updateBadge)

export {}
