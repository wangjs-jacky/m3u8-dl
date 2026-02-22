import { useState } from 'react'
import { useDownloadStore } from '../stores/downloadStore'

export function AddTaskForm() {
  const { startDownload, isLoading } = useDownloadStore()
  const [url, setUrl] = useState('')
  const [outputPath, setOutputPath] = useState('~/Downloads/videos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [referer, setReferer] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    const filename = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fullPath = `${outputPath}/${filename}.mp4`

    await startDownload(url.trim(), fullPath, referer.trim() || undefined)
    setUrl('')
  }

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText()
    setUrl(text)
  }

  return (
    <div className="add-task-form">
      <h2>添加下载任务</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>M3U8 链接</label>
          <div className="input-row">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴 m3u8 视频链接..."
              disabled={isLoading}
            />
            <button type="button" onClick={handlePaste} className="btn-paste">
              粘贴
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>保存位置</label>
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            placeholder="~/Downloads/videos"
            disabled={isLoading}
          />
        </div>

        <div className="advanced-toggle">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="btn-toggle"
          >
            {showAdvanced ? '▼' : '▶'} 高级选项
          </button>
        </div>

        {showAdvanced && (
          <div className="form-group">
            <label>Referer (可选)</label>
            <input
              type="text"
              value={referer}
              onChange={(e) => setReferer(e.target.value)}
              placeholder="视频来源页面 URL"
              disabled={isLoading}
            />
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? '添加中...' : '添加到队列'}
          </button>
        </div>
      </form>
    </div>
  )
}
