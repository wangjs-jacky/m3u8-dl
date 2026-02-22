import { ListVideo, Download, CheckCircle, XCircle, Pause } from 'lucide-react'
import { useDownloadStore, TaskFilter } from '../stores/downloadStore'

const filterItems: { key: TaskFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部任务', icon: <ListVideo size={18} /> },
  { key: 'downloading', label: '下载中', icon: <Download size={18} /> },
  { key: 'completed', label: '已完成', icon: <CheckCircle size={18} /> },
  { key: 'error', label: '错误', icon: <XCircle size={18} /> },
  { key: 'paused', label: '已暂停', icon: <Pause size={18} /> },
]

export function Sidebar() {
  const { taskFilter, setFilter, getTaskCounts } = useDownloadStore()
  const counts = getTaskCounts()

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-title">任务分类</div>
        {filterItems.map((item) => (
          <div
            key={item.key}
            className={`sidebar-item ${taskFilter === item.key ? 'active' : ''}`}
            onClick={() => setFilter(item.key)}
          >
            <div className="sidebar-item-icon">
              {item.icon}
              <span className="sidebar-item-label">{item.label}</span>
            </div>
            {counts[item.key] > 0 && (
              <span className="sidebar-count">{counts[item.key]}</span>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
