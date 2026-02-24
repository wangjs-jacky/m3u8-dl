import { useState, useEffect } from 'react'
import './download-confirm.css'

// 从 URL 参数获取数据
const getParams = () => {
  const params = new URLSearchParams(window.location.search)
  return {
    videoUrl: params.get('videoUrl') || '',
    pageUrl: params.get('pageUrl') || '',
    filename: params.get('filename') || '',
    defaultPath: params.get('defaultPath') || '',
    referer: params.get('referer') || ''
  }
}

function DownloadConfirm() {
  const [filename, setFilename] = useState('')
  const [defaultPath, setDefaultPath] = useState('')
  const [referer, setReferer] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const params = getParams()
    setVideoUrl(params.videoUrl)
    setFilename(params.filename)
    setDefaultPath(params.defaultPath)
    setReferer(params.referer)
  }, [])

  const showToast = (message: string) => {
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.textContent = message
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }

  const closeWindow = () => {
    window.close()
  }

  const executeDownload = async () => {
    setIsLoading(true)

    const API_BASE = 'http://localhost:15151'
    const outputPath = `${defaultPath}/${filename}.mp4`

    console.log('开始下载，URL:', videoUrl)
    console.log('API地址:', API_BASE)

    try {
      // 优先尝试 API 调用（桌面应用需要先启动）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 增加超时时间到 5 秒

      console.log('发送请求...')
      const response = await fetch(`${API_BASE}/api/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoUrl,
          referer: referer || undefined,
          output_path: outputPath
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      console.log('收到响应，状态:', response.status)

      if (response.ok) {
        showToast('已添加到下载队列')
        setTimeout(closeWindow, 1000)
        setIsLoading(false)
        return
      } else {
        throw new Error(`API returned ${response.status}`)
      }
    } catch (error) {
      console.error('API 调用失败:', error)
      showToast(`API 失败: ${error}`)
    }

    // API 不可用，降级到 Deep Link（仅生产模式支持）
    const params = new URLSearchParams()
    params.set('url', videoUrl)
    params.set('filename', filename)
    params.set('output_path', outputPath)
    if (referer) {
      params.set('referer', referer)
    }

    const deepLinkUrl = `m3u8-downloader://download?${params.toString()}`

    chrome.tabs.create({ url: deepLinkUrl, active: false }, (tab) => {
      setTimeout(() => {
        if (tab.id) chrome.tabs.remove(tab.id)
      }, 1000)
    })

    showToast('正在唤起桌面应用...')
    setTimeout(closeWindow, 1500)

    setIsLoading(false)
  }

  const truncateUrl = (url: string, maxLen = 45) => {
    if (url.length <= maxLen) return url
    return url.substring(0, maxLen) + '...'
  }

  return (
    <div className="confirm-container">
      <div className="confirm-content">
        <div className="confirm-header">
          <h3>确认下载</h3>
        </div>
        <div className="confirm-body">
          <div className="form-group">
            <label>文件名</label>
            <div className="filename-input-wrapper">
              <input
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                placeholder="输入文件名"
              />
              <span className="filename-ext">.mp4</span>
            </div>
          </div>
          <div className="form-group">
            <label>保存路径</label>
            <input
              type="text"
              value={defaultPath}
              onChange={e => setDefaultPath(e.target.value)}
              placeholder="输入保存路径"
            />
          </div>
          <div className="form-group">
            <label>Referer (可选)</label>
            <input
              type="text"
              value={referer}
              onChange={e => setReferer(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          {videoUrl && (
            <div className="video-info">
              <div className="info-label">视频地址</div>
              <div className="info-value" title={videoUrl}>
                {truncateUrl(videoUrl, 50)}
              </div>
            </div>
          )}
        </div>
        <div className="confirm-footer">
          <button className="btn-cancel" onClick={closeWindow} disabled={isLoading}>
            取消
          </button>
          <button className="btn-confirm" onClick={executeDownload} disabled={isLoading}>
            {isLoading ? '处理中...' : '确认下载'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DownloadConfirm
