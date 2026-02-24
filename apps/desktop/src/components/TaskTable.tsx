import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FolderOpen, Pause, Play, Trash2, Inbox, Film, Eye, RefreshCw } from 'lucide-react'
import { useDownloadStore, DownloadTask, DownloadStatus } from '../stores/downloadStore'

// 在 Finder 中显示文件
async function revealInFinder(path: string) {
  console.log('revealInFinder called with path:', path)
  try {
    const result = await invoke('reveal_in_finder', { path })
    console.log('reveal_in_finder result:', result)
  } catch (error) {
    console.error('Failed to reveal file:', error)
  }
}

interface TaskTableProps {
  onDoubleClick?: (task: DownloadTask) => void
}

function getStatusBadgeClass(status: DownloadStatus): string {
  switch (status) {
    case 'pending':
    case 'downloading_key':
    case 'downloading':
    case 'merging':
      return 'downloading'
    case 'paused':
      return 'paused'
    case 'completed':
      return 'completed'
    case 'error':
    case 'cancelled':
      return 'error'
    default:
      return 'pending'
  }
}

function getStatusText(task: DownloadTask): string {
  switch (task.status) {
    case 'pending':
      return '准备中'
    case 'downloading_key':
      return '下载密钥'
    case 'downloading':
      return '下载中'
    case 'paused':
      return '已暂停'
    case 'merging':
      return '合并中'
    case 'completed':
      return '已完成'
    case 'error':
      return '错误'
    case 'cancelled':
      return '已取消'
    default:
      return task.message
  }
}

function canCreatePreview(task: DownloadTask): boolean {
  // 下载中或已暂停，且有分片时可以创建预览
  const hasSegments = !!(task.downloadedSegments && task.downloadedSegments > 0) ||
                      !!(task.tempDir && task.progress >= 0)
  return ['downloading', 'paused'].includes(task.status) && hasSegments && !task.isMergingPreview
}

// 检测任务是否可能卡住（5分钟没有更新）
function mayBeStuck(task: DownloadTask): boolean {
  if (!['downloading', 'downloading_key', 'merging'].includes(task.status)) {
    return false
  }
  const lastUpdate = new Date(task.timestamp).getTime()
  const now = Date.now()
  const stuckThreshold = 5 * 60 * 1000 // 5 分钟
  const isStuck = (now - lastUpdate) > stuckThreshold
  console.log(`[DEBUG] 任务 ${task.id} 卡住检测:`, {
    status: task.status,
    lastUpdate: new Date(lastUpdate).toISOString(),
    now: new Date(now).toISOString(),
    diff: Math.floor((now - lastUpdate) / 1000 / 60),
    isStuck
  })
  return isStuck
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function formatTaskSize(task: DownloadTask): string {
  // 优先显示分片数量（M3U8 场景）
  if (task.totalSegments && task.totalSegments > 0) {
    return `${task.downloadedSegments || 0}/${task.totalSegments} 片`
  }
  // 其次显示文件大小
  if (task.totalSize && task.totalSize > 0) {
    return formatSize(task.totalSize)
  }
  return '--'
}

function getFilename(filePath: string): string {
  if (!filePath) return '未完成任务'
  return filePath.split('/').pop() || filePath
}

export function TaskTable({ onDoubleClick }: TaskTableProps) {
  const {
    getFilteredTasks,
    selectedTaskIds,
    toggleTaskSelection,
    pauseTask,
    resumeTask,
    deleteTask,
    taskFilter,
    createPreview,
    openDetailModal,
    refreshTask,
  } = useDownloadStore()

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean
    task: DownloadTask | null
  }>({ show: false, task: null })

  const tasks = getFilteredTasks()

  // 打开删除确认弹窗
  const openDeleteConfirm = (task: DownloadTask) => {
    setDeleteConfirm({ show: true, task })
  }

  // 确认删除
  const confirmDelete = async (deleteFiles: boolean) => {
    if (!deleteConfirm.task) return

    const task = deleteConfirm.task

    // 如果需要删除文件
    if (deleteFiles) {
      // 删除输出文件
      if (task.outputPath) {
        try {
          await invoke('delete_file', { path: task.outputPath })
        } catch (e) {
          console.error('删除输出文件失败:', e)
        }
      }
      // 删除临时目录
      const tempPath = (task as any)._tempPath
      if (tempPath) {
        try {
          await invoke('delete_file', { path: tempPath })
        } catch (e) {
          console.error('删除临时目录失败:', e)
        }
      }
    }

    // 删除任务记录
    await deleteTask(task.id)
    setDeleteConfirm({ show: false, task: null })
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Inbox size={48} strokeWidth={1.5} />
        </div>
        <div className="empty-state-title">
          {taskFilter === 'all' ? '暂无下载任务' : '该分类下没有任务'}
        </div>
        <div className="empty-state-text">
          {taskFilter === 'all' ? '点击"新建任务"开始下载视频' : '切换到其他分类查看任务'}
        </div>
      </div>
    )
  }

  const handleRowClick = (task: DownloadTask, e: React.MouseEvent) => {
    // 如果点击的是操作按钮，不触发行选择
    if ((e.target as HTMLElement).closest('.task-actions')) {
      return
    }
    toggleTaskSelection(task.id)
  }

  const handleRowDoubleClick = (task: DownloadTask) => {
    // 打开任务详情模态框
    openDetailModal(task.id)
    // 如果有外部回调，也调用它
    if (onDoubleClick) {
      onDoubleClick(task)
    }
  }

  const isActive = (task: DownloadTask) =>
    ['downloading', 'downloading_key', 'merging', 'pending'].includes(task.status)

  const isPaused = (task: DownloadTask) => task.status === 'paused'

  const isCompleted = (task: DownloadTask) => task.status === 'completed'

  const handleCreatePreview = async (task: DownloadTask) => {
    try {
      await createPreview(task.id, 'temporary')
    } catch (error: any) {
      console.error('Failed to create preview:', error)
      // 显示用户友好的错误提示
      const message = error?.message || '创建预览失败'
      alert(message)
    }
  }

  const openPreview = async (previewPath: string) => {
    try {
      await invoke('reveal_in_finder', { path: previewPath })
    } catch (error) {
      console.error('Failed to open preview:', error)
    }
  }

  const canDelete = (task: DownloadTask) =>
    ['completed', 'error', 'cancelled', 'paused'].includes(task.status)

  return (
    <div className="task-table-container">
      <table className="task-table">
        <thead>
          <tr>
            <th className="col-name">文件名</th>
            <th className="col-size">大小</th>
            <th className="col-status">状态</th>
            <th className="col-progress">进度</th>
            <th className="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className={selectedTaskIds.includes(task.id) ? 'selected' : ''}
              onClick={(e) => handleRowClick(task, e)}
              onDoubleClick={() => handleRowDoubleClick(task)}
            >
              <td className="col-name">
                <span className="task-name" title={task.outputPath}>
                  {getFilename(task.outputPath)}
                </span>
              </td>
              <td className="col-size">
                <span className="task-size">{formatTaskSize(task)}</span>
              </td>
              <td className="col-status">
                <div className="task-status-cell">
                  <span className={`status-badge ${getStatusBadgeClass(task.status)}`}>
                    {getStatusText(task)}
                  </span>
                  {task.status === 'error' && task.error && (
                    <span className="task-error-hint" title={task.error}>
                      ⚠️
                    </span>
                  )}
                </div>
              </td>
              <td className="col-progress">
                <div className={`task-progress-cell status-${getStatusBadgeClass(task.status)}`}>
                  <div className="progress-bar-wrapper">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="progress-percent">{task.progress.toFixed(0)}%</span>
                </div>
              </td>
              <td className="col-actions">
                <div className="task-actions">
                  {/* 刷新按钮：当任务可能卡住，或者下载状态但进度不匹配时显示 */}
                  {(mayBeStuck(task) || (task.status === 'downloading' && task.downloadedSegments === 0 && task.progress > 0)) && (
                    <button
                      className="btn-table-action"
                      onClick={async () => {
                        console.log(`[DEBUG] 点击刷新按钮: 任务 ${task.id}`, {
                          status: task.status,
                          progress: task.progress,
                          downloadedSegments: task.downloadedSegments,
                          totalSegments: task.totalSegments
                        })
                        try {
                          const result = await refreshTask(task.id)
                          console.log(`[DEBUG] 刷新结果:`, result)
                          if (result.wasStuck) {
                            console.log(`任务 ${task.id} 已重置`)
                          }
                          alert(result.message)
                        } catch (e: any) {
                          console.error('刷新失败:', e)
                          alert(e.message || '刷新失败')
                        }
                      }}
                      title="任务可能卡住，点击刷新"
                    >
                      <RefreshCw size={18} />
                    </button>
                  )}
                  {isActive(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => pauseTask(task.id)}
                      title="暂停"
                    >
                      <Pause size={18} />
                    </button>
                  )}
                  {isPaused(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => resumeTask(task.id)}
                      title="继续"
                    >
                      <Play size={18} />
                    </button>
                  )}
                  {isCompleted(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => revealInFinder(task.outputPath)}
                      title="打开文件夹"
                    >
                      <FolderOpen size={18} />
                    </button>
                  )}
                  {canDelete(task) && (
                    <button
                      className="btn-table-action danger"
                      onClick={() => openDeleteConfirm(task)}
                      title="删除"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  {/* 打开分片目录（仅下载中/暂停时显示，完成后临时目录已删除） */}
                  {task.tempDir && !isCompleted(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => revealInFinder(task.tempDir!)}
                      title="打开分片目录"
                    >
                      <FolderOpen size={18} />
                    </button>
                  )}
                  {/* 新增：合成预览按钮 */}
                  {canCreatePreview(task) && (
                    <button
                      className="btn-table-action preview"
                      onClick={() => handleCreatePreview(task)}
                      title="合成当前进度"
                      disabled={task.isMergingPreview}
                    >
                      <Film size={18} />
                    </button>
                  )}

                  {/* 新增：查看预览按钮 */}
                  {task.previews && task.previews.length > 0 && (
                    <button
                      className="btn-table-action"
                      onClick={() => openPreview(task.previews![task.previews!.length - 1].path)}
                      title={`查看预览 (${task.previews!.length}个)`}
                    >
                      <Eye size={18} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 删除确认弹窗 */}
      {deleteConfirm.show && deleteConfirm.task && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ show: false, task: null })}>
          <div className="modal modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">确认删除</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm({ show: false, task: null })}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px' }}>
                确定要删除任务 <strong>{getFilename(deleteConfirm.task.outputPath)}</strong> 吗？
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  className="btn btn-danger"
                  onClick={() => confirmDelete(true)}
                  style={{ width: '100%' }}
                >
                  删除任务和文件
                </button>
                <button
                  className="btn"
                  onClick={() => confirmDelete(false)}
                  style={{ width: '100%' }}
                >
                  仅删除任务记录
                </button>
                <button
                  className="btn"
                  onClick={() => setDeleteConfirm({ show: false, task: null })}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
