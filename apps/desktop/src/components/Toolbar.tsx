import { Plus, Play, Pause, Trash2, Settings } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

export function Toolbar() {
  const {
    selectedTaskIds,
    tasks,
    openNewTaskModal,
    openSettingsModal,
    pauseSelected,
    resumeSelected,
    deleteSelected,
  } = useDownloadStore()

  const hasSelection = selectedTaskIds.length > 0

  // 检查选中任务的状态
  const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id))
  const canPause = selectedTasks.some(t =>
    ['downloading', 'downloading_key', 'pending'].includes(t.status)
  )
  const canResume = selectedTasks.some(t => t.status === 'paused')
  const canDelete = selectedTasks.every(t =>
    ['completed', 'error', 'cancelled', 'paused'].includes(t.status)
  )

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="btn btn-primary" onClick={openNewTaskModal}>
          <Plus size={18} />
          <span>新建任务</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="btn btn-icon"
          onClick={resumeSelected}
          disabled={!hasSelection || !canResume}
          title="继续下载"
        >
          <Play size={18} />
        </button>
        <button
          className="btn btn-icon"
          onClick={pauseSelected}
          disabled={!hasSelection || !canPause}
          title="暂停下载"
        >
          <Pause size={18} />
        </button>
        <button
          className="btn btn-icon danger"
          onClick={deleteSelected}
          disabled={!hasSelection || !canDelete}
          title="删除任务"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {hasSelection && (
        <>
          <div className="toolbar-divider" />
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            已选择 {selectedTaskIds.length} 个任务
          </span>
        </>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="btn btn-icon" onClick={openSettingsModal} title="设置">
          <Settings size={18} />
        </button>
      </div>
    </div>
  )
}
