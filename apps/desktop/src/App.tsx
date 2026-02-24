import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useDownloadStore } from './stores/downloadStore'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { TaskTable } from './components/TaskTable'
import { NewTaskModal } from './components/NewTaskModal'
import { SettingsModal } from './components/SettingsModal'
import { TaskDetailModal } from './components/TaskDetailModal'
import './App.css'

interface DeepLinkDownloadPayload {
  url: string
  output_path?: string
  referer?: string
  filename?: string
}

function App() {
  const {
    theme,
    fetchTasks,
    startDownload,
    settings,
    syncConfigToServer,
    getDetailTask,
    closeDetailModal,
  } = useDownloadStore()

  // 启动时同步配置到 sidecar
  useEffect(() => {
    syncConfigToServer()
  }, [syncConfigToServer])

  // 启动时获取任务列表
  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 1000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  // 处理 Deep Link 下载请求
  const handleDeepLinkDownload = async (payload: DeepLinkDownloadPayload) => {
    const { url, output_path, referer, filename } = payload
    let outputPath: string
    if (output_path) {
      outputPath = output_path
    } else if (filename) {
      outputPath = `${settings.defaultOutputPath}/${filename}.mp4`
    } else {
      outputPath = `${settings.defaultOutputPath}/video_${Date.now()}.mp4`
    }
    await startDownload(url, outputPath, referer)
  }

  // 启动时检查是否有待处理的 Deep Link
  useEffect(() => {
    const checkPendingDeepLink = async () => {
      try {
        const pending = await invoke<DeepLinkDownloadPayload | null>('get_pending_deep_link')
        if (pending) {
          console.log('Found pending deep link:', pending)
          await handleDeepLinkDownload(pending)
        }
      } catch (error) {
        console.error('Failed to check pending deep link:', error)
      }
    }

    // 延迟一小段时间，确保 Sidecar 已启动
    const timer = setTimeout(checkPendingDeepLink, 500)
    return () => clearTimeout(timer)
  }, [settings.defaultOutputPath, startDownload])

  // 监听 deep-link-download 事件（来自浏览器插件，应用已运行时）
  useEffect(() => {
    const unlisten = listen<DeepLinkDownloadPayload>('deep-link-download', async (event) => {
      await handleDeepLinkDownload(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [startDownload, settings.defaultOutputPath])

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
      <TaskDetailModal task={getDetailTask()} onClose={closeDetailModal} />
    </div>
  )
}

export default App
