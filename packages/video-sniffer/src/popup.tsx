import { useState, useEffect } from 'react'
import type { VideoItem, StorageData, FilterType } from './types'
import './popup.css'

function IndexPopup() {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [currentTabUrl, setCurrentTabUrl] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 加载视频列表
  const loadVideos = async () => {
    const data = await chrome.storage.local.get('videos') as StorageData
    setVideos(data.videos || [])
  }

  // 获取当前标签页 URL
  const getCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    setCurrentTabUrl(tab?.url || '')
  }

  useEffect(() => {
    loadVideos()
    getCurrentTab()
  }, [])

  // 过滤视频列表
  const filteredVideos = videos.filter(v => {
    if (filter === 'm3u8') return v.type === 'm3u8'
    if (filter === 'mp4') return v.type === 'mp4'
    if (filter === 'currentTab') {
      try {
        const videoDomain = new URL(v.pageUrl).hostname
        const currentDomain = new URL(currentTabUrl).hostname
        return videoDomain === currentDomain
      } catch {
        return false
      }
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

  // 一键下载
  const download = async (url: string, filename?: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          output_path: `~/Downloads/${filename || 'video'}.mp4`
        })
      })

      if (response.ok) {
        showToast('已添加到下载队列')
      } else {
        const error = await response.json()
        showToast(`添加失败: ${error.error || '未知错误'}`)
      }
    } catch (error) {
      showToast('无法连接到桌面应用，请确保已启动')
    }
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

  // 生成文件名
  const generateFilename = (video: VideoItem) => {
    const timestamp = new Date(video.timestamp).toISOString().slice(0, 10)
    return `video_${timestamp}_${video.id.slice(0, 6)}`
  }

  // 批量下载选中项
  const downloadSelected = async () => {
    const selectedVideos = filteredVideos.filter(v => selectedIds.has(v.id))
    for (const video of selectedVideos) {
      await download(video.url, generateFilename(video))
    }
    setSelectedIds(new Set())
  }

  return (
    <div className="popup-container">
      <header className="header">
        <h1>视频嗅探器</h1>
        <span className="count">{videos.length} 条记录</span>
      </header>

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterType)}>
          <option value="all">全部</option>
          <option value="m3u8">M3U8</option>
          <option value="mp4">MP4</option>
          <option value="currentTab">当前页面</option>
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
                <span className={`type-badge ${v.type}`}>{v.type.toUpperCase()}</span>
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
                <button className="btn-download" onClick={() => download(v.url)}>下载</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default IndexPopup
