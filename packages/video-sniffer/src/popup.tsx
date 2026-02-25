import { useState, useEffect } from 'react'
import type { VideoItem, StorageData, FilterType } from './types'
import './popup.css'

function IndexPopup() {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [filter, setFilter] = useState<FilterType>('currentTab')
  const [currentTabUrl, setCurrentTabUrl] = useState<string>('')
  const [currentTabId, setCurrentTabId] = useState<number>(-1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [referer, setReferer] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)

  // 加载视频列表
  const loadVideos = async () => {
    const data = await chrome.storage.local.get('videos') as StorageData
    setVideos(data.videos || [])
  }

  // 获取当前标签页 URL 并自动填充为 Referer
  const getCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = tab?.url || ''
    const tabId = tab?.id ?? -1
    setCurrentTabUrl(url)
    setCurrentTabId(tabId)
    // 自动提取当前页面的 origin 作为默认 Referer
    try {
      const origin = new URL(url).origin
      setReferer(origin)
    } catch {
      setReferer('')
    }
  }

  useEffect(() => {
    loadVideos()
    getCurrentTab()
  }, [])

  // 过滤视频列表
  const filteredVideos = videos.filter(v => {
    if (filter === 'currentTab') {
      return v.tabId === currentTabId
    }
    if (filter === 'bestQuality') {
      // 每个分组只显示最高画质的视频
      const groupBest = new Map<string, VideoItem>()
      videos.forEach(video => {
        const gid = video.groupId || video.url
        const existing = groupBest.get(gid)
        if (!existing) {
          groupBest.set(gid, video)
        } else {
          // 比较画质：优先高度，其次带宽
          const existingHeight = existing.quality?.height || 0
          const currentHeight = video.quality?.height || 0
          const existingBandwidth = existing.quality?.bandwidth || 0
          const currentBandwidth = video.quality?.bandwidth || 0

          if (currentHeight > existingHeight ||
              (currentHeight === existingHeight && currentBandwidth > existingBandwidth)) {
            groupBest.set(gid, video)
          }
        }
      })
      return Array.from(groupBest.values()).includes(v)
    }
    return true
  })

  // 复制链接
  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    // 简单的提示效果
    const btn = document.activeElement as HTMLElement
    const originalText = btn.textContent
    btn.textContent = '已复制!'
    setTimeout(() => btn.textContent = originalText, 1000)
  }

  const API_BASE = 'http://localhost:15151'

  const showToast = (message: string) => {
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.textContent = message
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }

  // 获取默认下载路径
  const getDefaultPath = async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/config`)
      if (response.ok) {
        const config = await response.json()
        return config.defaultOutputPath || null
      }
    } catch {
      // 忽略错误，返回 null
    }
    return null
  }

  // 生成文件名
  const generateFilename = (video: VideoItem) => {
    const timestamp = new Date(video.timestamp).toISOString().slice(0, 10)
    return `video_${timestamp}_${video.id.slice(0, 6)}`
  }

  // 从页面 URL 提取文件名（兜底策略）
  const extractFilenameFromUrl = (pageUrl: string): string | null => {
    try {
      const url = new URL(pageUrl)
      const pathname = url.pathname
      // 从路径中提取最后一个非 .html/.htm 的部分
      const segments = pathname.split('/').filter(Boolean)
      const lastSegment = segments[segments.length - 1]
      if (lastSegment) {
        // 移除 .html, .htm 等后缀
        const name = lastSegment.replace(/\.(html?|php|aspx?)$/i, '')
        if (name && name.length > 0 && name.length < 100) {
          return name
        }
      }
    } catch {
      // 忽略解析错误
    }
    return null
  }

  // 打开下载确认弹窗（使用独立窗口）
  const openDownloadConfirm = async (video: VideoItem) => {
    const defaultPath = await getDefaultPath() || '~/Downloads/videos'
    const filename = extractFilenameFromUrl(video.pageUrl) || generateFilename(video)

    // 通过 URL 参数传递数据给独立窗口
    const params = new URLSearchParams({
      videoUrl: video.url,
      pageUrl: video.pageUrl,
      filename,
      defaultPath,
      referer: referer || ''
    })

    // 创建独立的 dialog 窗口
    chrome.windows.create({
      url: chrome.runtime.getURL(`tabs/download-confirm.html?${params.toString()}`),
      type: 'popup',
      width: 400,
      height: 420,
      focused: true
    })
  }

  // 清空列表
  const clearAll = async () => {
    await chrome.storage.local.set({ videos: [] })
    setVideos([])
    chrome.action.setBadgeText({ text: '' })
  }

  // 删除单个
  const deleteItem = async (id: string) => {
    const updated = videos.filter(v => v.id !== id)
    await chrome.storage.local.set({ videos: updated })
    setVideos(updated)
    chrome.action.setBadgeText({ text: updated.length > 0 ? updated.length.toString() : '' })
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 截断 URL 显示
  const truncateUrl = (url: string, maxLen = 50) => {
    if (url.length <= maxLen) return url
    return url.substring(0, maxLen) + '...'
  }

  // 切换选中状态
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // 批量下载选中项
  const downloadSelected = async () => {
    const selectedVideos = filteredVideos.filter(v => selectedIds.has(v.id))
    const defaultPath = await getDefaultPath() || '~/Downloads/videos'
    const API_BASE = 'http://localhost:15151'

    let successCount = 0
    let failCount = 0

    for (const video of selectedVideos) {
      const filename = extractFilenameFromUrl(video.pageUrl) || generateFilename(video)
      const outputPath = `${defaultPath}/${filename}.mp4`

      try {
        const response = await fetch(`${API_BASE}/api/download/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: video.url,
            referer: referer || undefined,
            output_path: outputPath
          })
        })

        if (response.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    if (successCount > 0) {
      showToast(`已添加 ${successCount} 个任务`)
    }
    if (failCount > 0) {
      showToast(`${failCount} 个任务失败（请确保桌面应用正在运行）`)
    }
    setSelectedIds(new Set())
  }

  return (
    <div className="popup-container">
      {/* 主内容区域 */}
      <header className="header">
            <h1>视频嗅探器</h1>
            <span className="count">{videos.length} 条记录</span>
            <button
              className={`btn-settings ${showSettings ? 'active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              title="设置"
            >
              ⚙
            </button>
          </header>

          {showSettings && (
            <div className="settings-panel">
              <label className="referer-label">
                Referer (可选)
                <input
                  type="text"
                  value={referer}
                  onChange={(e) => setReferer(e.target.value)}
                  placeholder="https://example.com"
                  className="referer-input"
                />
              </label>
              <p className="referer-hint">某些视频需要正确的 Referer 才能下载</p>
            </div>
          )}

          <div className="toolbar">
            <select value={filter} onChange={(e) => setFilter(e.target.value as FilterType)}>
              <option value="currentTab">当前页面</option>
              <option value="bestQuality">最佳画质</option>
              <option value="all">全部</option>
            </select>
            <button
              className="btn-batch"
              onClick={downloadSelected}
              disabled={selectedIds.size === 0}
            >
              下载选中 ({selectedIds.size})
            </button>
            <button className="btn-clear" onClick={clearAll}>清空</button>
          </div>

          <div className="video-list">
            {filteredVideos.length === 0 ? (
              <div className="empty">
                <p>暂无嗅探到视频资源</p>
                <p className="hint">浏览包含视频的页面后会自动捕获</p>
              </div>
            ) : (
              filteredVideos.map(v => (
                <div key={v.id} className="video-item">
                  <div className="video-header">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                      className="checkbox"
                    />
                    <span className="type-badge m3u8">M3U8</span>
                    {v.quality?.label && (
                      <span className="quality-badge">{v.quality.label}</span>
                    )}
                    <span className="time">{formatTime(v.timestamp)}</span>
                    <button className="btn-delete" onClick={() => deleteItem(v.id)}>×</button>
                  </div>
                  <div className="video-url" title={v.url}>
                    {truncateUrl(v.url)}
                  </div>
                  <div className="video-source" title={v.pageUrl}>
                    来源: {truncateUrl(v.pageUrl, 40)}
                  </div>
                  <div className="video-actions">
                    <button className="btn-copy" onClick={() => copyUrl(v.url)}>复制</button>
                    <button className="btn-download" onClick={() => openDownloadConfirm(v)}>下载</button>
                  </div>
                </div>
              ))
            )}
          </div>
    </div>
  )
}

export default IndexPopup
