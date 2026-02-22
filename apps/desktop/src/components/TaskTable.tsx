import { invoke } from '@tauri-apps/api/core'
import { FolderOpen, Pause, Play, Trash2, Inbox, Film, Eye } from 'lucide-react'
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
  // 下载中且进度大于 0 时可以创建预览
  return ['downloading'].includes(task.status) && task.progress > 0 && !task.isMergingPreview
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

function getFilename(path: string): string {
  return path.split('/').pop() || path
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
    createPreview,  // 新增
  } = useDownloadStore()

  const tasks = getFilteredTasks()

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
    } catch (error) {
      console.error('Failed to create preview:', error)
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
                <span className="task-size">{formatSize(task.totalSize)}</span>
              </td>
              <td className="col-status">
                <span className={`status-badge ${getStatusBadgeClass(task.status)}`}>
                  {getStatusText(task)}
                </span>
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
                  {isActive(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => pauseTask(task.id)}
                      title="暂停"
                    >
                      <Pause size={16} />
                    </button>
                  )}
                  {isPaused(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => resumeTask(task.id)}
                      title="继续"
                    >
                      <Play size={16} />
                    </button>
                  )}
                  {isCompleted(task) && (
                    <button
                      className="btn-table-action"
                      onClick={() => revealInFinder(task.outputPath)}
                      title="打开文件夹"
                    >
                      <FolderOpen size={16} />
                    </button>
                  )}
                  {canDelete(task) && (
                    <button
                      className="btn-table-action danger"
                      onClick={() => deleteTask(task.id)}
                      title="删除"
                    >
                      <Trash2 size={16} />
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
                      <Film size={16} />
                    </button>
                  )}

                  {/* 新增：查看预览按钮 */}
                  {task.previews && task.previews.length > 0 && (
                    <button
                      className="btn-table-action"
                      onClick={() => openPreview(task.previews![task.previews!.length - 1].path)}
                      title={`查看预览 (${task.previews!.length}个)`}
                    >
                      <Eye size={16} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
