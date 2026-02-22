import { DownloadTask, useDownloadStore } from '../stores/downloadStore'

interface TaskItemProps {
  task: DownloadTask
}

export function TaskItem({ task }: TaskItemProps) {
  const { pauseTask, resumeTask, cancelTask } = useDownloadStore()

  const getStatusText = () => {
    switch (task.status) {
      case 'pending': return '准备中...'
      case 'downloading_key': return '下载密钥中...'
      case 'downloading': return task.message || '下载中...'
      case 'paused': return '已暂停'
      case 'merging': return '合并视频中...'
      case 'completed': return '已完成'
      case 'error': return `错误: ${task.error || '未知错误'}`
      case 'cancelled': return '已取消'
      default: return task.message
    }
  }

  const getStatusClass = () => {
    switch (task.status) {
      case 'completed': return 'status-success'
      case 'error': return 'status-error'
      case 'paused': return 'status-warning'
      case 'cancelled': return 'status-warning'
      default: return 'status-downloading'
    }
  }

  const isActive = ['downloading', 'downloading_key', 'merging', 'pending'].includes(task.status)
  const isPaused = task.status === 'paused'
  const isCompleted = task.status === 'completed'

  const filename = task.outputPath.split('/').pop() || task.outputPath

  return (
    <div className={`task-item ${getStatusClass()}`}>
      <div className="task-header">
        <span className="task-filename">{filename}</span>
        <div className="task-actions">
          {isActive && (
            <button onClick={() => pauseTask(task.id)} className="btn-action">
              ⏸
            </button>
          )}
          {isPaused && (
            <button onClick={() => resumeTask(task.id)} className="btn-action">
              ▶️
            </button>
          )}
          {!isCompleted && (
            <button onClick={() => cancelTask(task.id)} className="btn-action">
              ❌
            </button>
          )}
          {isCompleted && (
            <button
              onClick={() => {/* TODO: 打开文件夹 */}}
              className="btn-action"
            >
              📂
            </button>
          )}
        </div>
      </div>

      <div className="task-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <span className="progress-text">{task.progress.toFixed(0)}%</span>
      </div>

      <div className="task-status">{getStatusText()}</div>
    </div>
  )
}
