import { useEffect } from 'react'
import { useDownloadStore } from './stores/downloadStore'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { TaskTable } from './components/TaskTable'
import { NewTaskModal } from './components/NewTaskModal'
import { SettingsModal } from './components/SettingsModal'
import './App.css'

function App() {
  const { theme, fetchTasks } = useDownloadStore()

  // 启动时获取任务列表
  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 1000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  return (
    <div className={`app theme-${theme}`}>
      <Toolbar />

      <div className="main-container">
        <Sidebar />
        <main className="content">
          <TaskTable />
        </main>
      </div>

      <NewTaskModal />
      <SettingsModal />
    </div>
  )
}

export default App
