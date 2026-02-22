import { useState, useEffect } from 'react'
import './App.css'

interface DownloadStatus {
  progress: number
  status: 'pending' | 'downloading_key' | 'downloading' | 'merging' | 'completed' | 'error' | 'cancelled'
  message: string
  error?: string
}

function App() {
  const [url, setUrl] = useState('')
  const [outputPath, setOutputPath] = useState('')

  // 从 URL 参数读取并预填
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlParam = params.get('url')
    if (urlParam) {
      setUrl(urlParam)
    }
  }, [])
  const [referer, setReferer] = useState('')
  const [maxWorkers, setMaxWorkers] = useState(8)
  const [durationLimit, setDurationLimit] = useState<number | null>(null)
  const [downloadId, setDownloadId] = useState<string | null>(null)
  const [status, setStatus] = useState<DownloadStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // 轮询下载状态
  const pollStatus = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/download/${id}/status`)
      if (response.ok) {
        const data: DownloadStatus = await response.json()
        setStatus(data)

        // 下载完成或失败后停止轮询
        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
          setIsLoading(false)
        } else {
          setTimeout(() => pollStatus(id), 1000)
        }
      }
    } catch (error) {
      console.error('获取状态失败:', error)
      setIsLoading(false)
    }
  }

  const startDownload = async () => {
    if (!url.trim() || !outputPath.trim()) {
      alert('请填写 M3U8 链接和保存位置')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:5001/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          output_path: outputPath,
          referer,
          max_workers: maxWorkers,
          duration_limit: durationLimit
        })
      })

      if (response.ok) {
        const data = await response.json()
        setDownloadId(data.download_id)
        pollStatus(data.download_id)
      } else {
        const error = await response.json()
        alert(`启动失败: ${error.error}`)
        setIsLoading(false)
      }
    } catch (error) {
      alert(`网络错误: ${error}`)
      setIsLoading(false)
    }
  }

  const cancelDownload = async () => {
    if (!downloadId) return

    try {
      await fetch(`http://localhost:5001/api/download/${downloadId}/cancel`, {
        method: 'POST'
      })
      setIsLoading(false)
      setStatus({ progress: 0, status: 'cancelled', message: '已取消' })
    } catch (error) {
      alert(`取消失败: ${error}`)
    }
  }

  const getStatusText = () => {
    if (!status) return '准备就绪'
    switch (status.status) {
      case 'pending': return '准备中...'
      case 'downloading_key': return '下载密钥中...'
      case 'downloading': return status.message
      case 'merging': return '合并视频中...'
      case 'completed': return '下载完成!'
      case 'error': return `错误: ${status.error || '未知错误'}`
      case 'cancelled': return '已取消'
      default: return status.message
    }
  }

  const getStatusClass = () => {
    if (!status) return 'status-ready'
    switch (status.status) {
      case 'completed': return 'status-success'
      case 'error': return 'status-error'
      case 'cancelled': return 'status-warning'
      default: return 'status-downloading'
    }
  }

  // 检查是否需要 Referer 提示
  const needsRefererHint = () => {
    return status?.status === 'error' &&
           !referer.trim() &&
           (status.error?.includes('404') || status.error?.includes('没有成功下载'))
  }

  return (
    <div className="app">
      <div className="animated-bg">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
        <div className="bg-orb bg-orb-4"></div>
      </div>
      <div className="grid-overlay"></div>
      <div className="noise-overlay"></div>
      <div className="container">
        <h1 className="title"><span>🎬 M3U8 视频下载器</span></h1>

        <div className="card">
          <div className="form-group">
            <label>M3U8 链接</label>
            <input
              type="text"
              className="input"
              placeholder="粘贴 m3u8 视频链接..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>保存位置</label>
            <input
              type="text"
              className="input"
              placeholder="/Users/yourname/Downloads/video.mp4"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              disabled={isLoading}
            />
            <small style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              提示: macOS 默认下载路径通常是 /Users/你的用户名/Downloads/
            </small>
          </div>

          <div className="form-group">
            <label>Referer (可选)</label>
            <input
              type="text"
              className="input"
              value={referer}
              onChange={(e) => setReferer(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>并发下载数: {maxWorkers}</label>
            <input
              type="range"
              className="slider"
              min="1"
              max="32"
              value={maxWorkers}
              onChange={(e) => setMaxWorkers(parseInt(e.target.value))}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>下载时长限制 (分钟)</label>
            <input
              type="number"
              className="input"
              placeholder="留空下载完整视频"
              value={durationLimit ?? ''}
              onChange={(e) => setDurationLimit(e.target.value ? parseInt(e.target.value) : null)}
              disabled={isLoading}
              min="1"
            />
            <small style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              提示: 设置为 10 表示只下载前 10 分钟内容，留空则下载完整视频
            </small>
          </div>

          {/* 进度条 */}
          {status && (
            <div className="progress-section">
              <div className="progress-info">
                <span className="status-text">{getStatusText()}</span>
                <span className="progress-percent">{status.progress.toFixed(0)}%</span>
              </div>
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${status.progress}%` }}
                />
              </div>

              {/* Referer 提示 */}
              {needsRefererHint() && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'rgba(255, 193, 7, 0.1)',
                  border: '1px solid rgba(255, 193, 7, 0.3)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: '#ffc107'
                }}>
                  <strong>💡 提示：</strong>下载失败（404 错误），请尝试填写 <strong>Referer</strong> 字段。<br/>
                  Referer 通常是视频来源页面的网址。
                </div>
              )}
            </div>
          )}

          {/* 按钮 */}
          <div className="button-group">
            {!isLoading ? (
              <button
                className="btn btn-primary"
                onClick={startDownload}
              >
                开始下载
              </button>
            ) : (
              <button
                className="btn btn-warning"
                onClick={cancelDownload}
              >
                停止下载
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
