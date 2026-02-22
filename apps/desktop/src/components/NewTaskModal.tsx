import { useState, useEffect } from 'react'
import { useDownloadStore } from '../stores/downloadStore'

export function NewTaskModal() {
  const {
    isNewTaskModalOpen,
    closeNewTaskModal,
    startDownload,
    isLoading,
    settings,
  } = useDownloadStore()

  const [url, setUrl] = useState('')
  const [outputPath, setOutputPath] = useState(settings.defaultOutputPath)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [referer, setReferer] = useState('')

  // 当弹窗打开时，同步默认路径
  useEffect(() => {
    if (isNewTaskModalOpen) {
      setOutputPath(settings.defaultOutputPath)
    }
  }, [isNewTaskModalOpen, settings.defaultOutputPath])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    const filename = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fullPath = `${outputPath}/${filename}.mp4`

    try {
      await startDownload(url.trim(), fullPath, referer.trim() || undefined)
      setUrl('')
      setReferer('')
      closeNewTaskModal()
    } catch (error) {
      console.error('Failed to start download:', error)
    }
  }

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText()
    setUrl(text)
  }

  const handleBrowse = async () => {
    // TODO: 使用 Tauri 的文件对话框
    // 目前暂时手动输入
    console.log('Browse folder...')
  }

  if (!isNewTaskModalOpen) return null

  return (
    <div className="modal-overlay" onClick={closeNewTaskModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">新建下载任务</h2>
          <button className="modal-close" onClick={closeNewTaskModal}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">M3U8 链接</label>
              <div className="form-input-group">
                <input
                  type="text"
                  className="form-input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="粘贴 m3u8 视频链接..."
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn"
                  onClick={handlePaste}
                  disabled={isLoading}
                >
                  粘贴
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">保存位置</label>
              <div className="form-input-group">
                <input
                  type="text"
                  className="form-input"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="~/Downloads/videos"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={handleBrowse}
                  disabled={isLoading}
                >
                  浏览
                </button>
              </div>
              <div className="form-hint">文件将自动以时间戳命名</div>
            </div>

            <button
              type="button"
              className={`toggle-btn ${showAdvanced ? 'open' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>▶</span>
              <span>高级选项</span>
            </button>

            {showAdvanced && (
              <div className="advanced-section">
                <div className="form-group">
                  <label className="form-label">Referer（可选）</label>
                  <input
                    type="text"
                    className="form-input"
                    value={referer}
                    onChange={(e) => setReferer(e.target.value)}
                    placeholder="视频来源页面 URL，某些网站需要"
                    disabled={isLoading}
                  />
                  <div className="form-hint">
                    某些网站会检查 Referer，填写视频所在页面地址
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn"
              onClick={closeNewTaskModal}
              disabled={isLoading}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? '添加中...' : '添加任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
