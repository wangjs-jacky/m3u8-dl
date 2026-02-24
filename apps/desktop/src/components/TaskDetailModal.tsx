import { useState } from 'react'
import { DownloadTask } from '../stores/downloadStore'
import { formatDate } from '../utils/format'

interface TaskDetailModalProps {
  task: DownloadTask | null
  onClose: () => void
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '准备中',
    downloading_key: '下载密钥',
    downloading: '下载中',
    paused: '已暂停',
    merging: '合并中',
    completed: '已完成',
    error: '错误',
    cancelled: '已取消',
  }
  return statusMap[status] || status
}

function formatDuration(duration?: string): string {
  if (!duration) return '--'
  return duration
}

// 复制到剪贴板
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedReferer, setCopiedReferer] = useState(false)

  if (!task) return null

  const handleCopyUrl = async () => {
    const success = await copyToClipboard(task.url)
    if (success) {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    }
  }

  const handleCopyReferer = async () => {
    const success = await copyToClipboard(task.referer || '')
    if (success) {
      setCopiedReferer(true)
      setTimeout(() => setCopiedReferer(false), 2000)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">任务详情</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* 基本信息 */}
          <div className="detail-section">
            <h3 className="detail-section-title">基本信息</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">任务 ID</span>
                <span className="detail-value">{task.id}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">状态</span>
                <span className={`detail-value status-${task.status}`}>
                  {getStatusText(task.status)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">进度</span>
                <span className="detail-value">{task.progress}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">分片进度</span>
                <span className="detail-value">
                  {task.downloadedSegments ?? 0} / {task.totalSegments ?? 0}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">创建时间</span>
                <span className="detail-value">{formatDate(task.createdAt)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">更新时间</span>
                <span className="detail-value">{formatDate(task.timestamp)}</span>
              </div>
            </div>
          </div>

          {/* 请求信息 */}
          <div className="detail-section">
            <h3 className="detail-section-title">请求信息</h3>
            <div className="detail-grid">
              {/* M3U8 链接 */}
              <div className="detail-item full-width">
                <div className="detail-label-row">
                  <span className="detail-label">M3U8 链接</span>
                  <button
                    className="btn-copy"
                    onClick={handleCopyUrl}
                    title="复制链接"
                  >
                    {copiedUrl ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="detail-url-full">
                  {task.url}
                </div>
              </div>

              {/* Referer */}
              <div className="detail-item full-width">
                <div className="detail-label-row">
                  <span className="detail-label">Referer</span>
                  {task.referer && (
                    <button
                      className="btn-copy"
                      onClick={handleCopyReferer}
                      title="复制 Referer"
                    >
                      {copiedReferer ? '已复制' : '复制'}
                    </button>
                  )}
                </div>
                <div className="detail-url-full">
                  {task.referer || <span className="detail-empty">未设置</span>}
                </div>
              </div>

              {/* 输出路径 */}
              <div className="detail-item full-width">
                <span className="detail-label">输出路径</span>
                <div className="detail-url-full">
                  {task.outputPath}
                </div>
              </div>

              {/* 临时目录 */}
              <div className="detail-item full-width">
                <span className="detail-label">临时目录</span>
                <div className="detail-url-full">
                  {task.tempDir || <span className="detail-empty">无</span>}
                </div>
              </div>
            </div>
          </div>

          {/* 消息 */}
          {task.message && (
            <div className="detail-section">
              <h3 className="detail-section-title">状态消息</h3>
              <div className="detail-message">{task.message}</div>
            </div>
          )}

          {/* 错误信息 */}
          {task.error && (
            <div className="detail-section detail-error-section">
              <h3 className="detail-section-title">错误信息</h3>
              <div className="detail-error">{task.error}</div>
            </div>
          )}

          {/* 预览文件 */}
          {task.previews && task.previews.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-section-title">预览文件</h3>
              <div className="detail-previews">
                {task.previews.map((preview, index) => (
                  <div key={index} className="preview-item">
                    <span className="preview-name">{preview.file}</span>
                    <span className="preview-info">
                      {preview.segments} 分片 · {formatDuration(preview.duration)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
