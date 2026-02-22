import { useEffect } from 'react'
import { useDownloadStore } from './stores/downloadStore'
import { TaskList } from './components/TaskList'
import { AddTaskForm } from './components/AddTaskForm'

function App() {
  const { fetchTasks } = useDownloadStore()

  // 启动时获取任务列表
  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 1000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  return (
    <div className="app">
      <header className="header">
        <h1>M3U8 视频下载器</h1>
      </header>
      <main className="main">
        <AddTaskForm />
        <TaskList />
      </main>
    </div>
  )
}

export default App
