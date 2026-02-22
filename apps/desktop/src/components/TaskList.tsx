import { useDownloadStore } from '../stores/downloadStore'
import { TaskItem } from './TaskItem'

export function TaskList() {
  const { tasks, clearCompleted } = useDownloadStore()

  const activeCount = tasks.filter(t =>
    ['pending', 'downloading', 'downloading_key', 'merging', 'paused'].includes(t.status)
  ).length

  const completedCount = tasks.filter(t =>
    ['completed', 'error', 'cancelled'].includes(t.status)
  ).length

  if (tasks.length === 0) {
    return (
      <div className="task-list empty">
        <p>暂无下载任务</p>
        <p className="hint">添加 M3U8 链接开始下载</p>
      </div>
    )
  }

  return (
    <div className="task-list">
      <div className="task-list-header">
        <span>下载任务 ({activeCount} 个进行中 / {tasks.length} 个总计)</span>
        {completedCount > 0 && (
          <button onClick={clearCompleted} className="btn-clear">
            清除已完成
          </button>
        )}
      </div>

      <div className="task-items">
        {tasks.map(task => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}
