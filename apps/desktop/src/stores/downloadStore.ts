import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const API_BASE = 'http://localhost:15151'

export type DownloadStatus =
  | 'pending'
  | 'downloading_key'
  | 'downloading'
  | 'paused'
  | 'merging'
  | 'completed'
  | 'error'
  | 'cancelled'

export type TaskFilter = 'all' | 'downloading' | 'completed' | 'error' | 'paused'

export interface DownloadTask {
  id: string
  url: string
  outputPath: string
  progress: number
  status: DownloadStatus
  message: string
  error?: string
  createdAt: string
  timestamp: string
  // 扩展字段
  speed?: string
  eta?: string
  totalSize?: number
  downloadedSize?: number
}

export interface AppSettings {
  defaultOutputPath: string
  maxConcurrent: number
  proxyEnabled: boolean
  proxyUrl: string
  autoRetry: boolean
  retryCount: number
  retryDelay: number
}

interface DownloadStore {
  // 任务状态
  tasks: DownloadTask[]
  isLoading: boolean

  // UI 状态
  selectedTaskIds: string[]
  taskFilter: TaskFilter
  theme: 'light' | 'dark'

  // 弹窗状态
  isNewTaskModalOpen: boolean
  isSettingsModalOpen: boolean
  isBatchAddModalOpen: boolean

  // 设置
  settings: AppSettings

  // 基础方法
  fetchTasks: () => Promise<void>
  startDownload: (url: string, outputPath: string, referer?: string) => Promise<void>
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>

  // UI 方法
  setSelectedTasks: (ids: string[]) => void
  toggleTaskSelection: (id: string) => void
  selectAllTasks: () => void
  clearSelection: () => void
  setFilter: (filter: TaskFilter) => void
  toggleTheme: () => void

  // 弹窗方法
  openNewTaskModal: () => void
  closeNewTaskModal: () => void
  openSettingsModal: () => void
  closeSettingsModal: () => void
  openBatchAddModal: () => void
  closeBatchAddModal: () => void

  // 设置方法
  updateSettings: (settings: Partial<AppSettings>) => void

  // 批量操作
  pauseSelected: () => Promise<void>
  resumeSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  retrySelected: () => Promise<void>

  // 批量添加
  addBatchTasks: (urls: string[], outputPath: string, referer?: string) => Promise<void>

  // 辅助方法
  getFilteredTasks: () => DownloadTask[]
  getTaskCounts: () => { all: number; downloading: number; completed: number; error: number; paused: number }
}

const defaultSettings: AppSettings = {
  defaultOutputPath: '~/Downloads/videos',
  maxConcurrent: 8,
  proxyEnabled: false,
  proxyUrl: '',
  autoRetry: true,
  retryCount: 3,
  retryDelay: 5,
}

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set, get) => ({
      // 初始状态
      tasks: [],
      isLoading: false,
      selectedTaskIds: [],
      taskFilter: 'all',
      theme: 'dark',
      isNewTaskModalOpen: false,
      isSettingsModalOpen: false,
      isBatchAddModalOpen: false,
      settings: defaultSettings,

      // 基础方法
      fetchTasks: async () => {
        try {
          const response = await fetch(`${API_BASE}/api/downloads`)
          if (response.ok) {
            const tasks: DownloadTask[] = await response.json()
            set({ tasks })
          }
        } catch (error) {
          console.error('Failed to fetch tasks:', error)
        }
      },

      startDownload: async (url, outputPath, referer) => {
        set({ isLoading: true })
        try {
          const response = await fetch(`${API_BASE}/api/download/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              output_path: outputPath,
              referer: referer || '',
            }),
          })
          if (response.ok) {
            await get().fetchTasks()
          } else {
            const error = await response.json()
            throw new Error(error.error || '启动下载失败')
          }
        } finally {
          set({ isLoading: false })
        }
      },

      pauseTask: async (id) => {
        await fetch(`${API_BASE}/api/download/${id}/pause`, { method: 'POST' })
        await get().fetchTasks()
      },

      resumeTask: async (id) => {
        await fetch(`${API_BASE}/api/download/${id}/resume`, { method: 'POST' })
        await get().fetchTasks()
      },

      cancelTask: async (id) => {
        await fetch(`${API_BASE}/api/download/${id}/cancel`, { method: 'POST' })
        await get().fetchTasks()
      },

      deleteTask: async (id) => {
        await fetch(`${API_BASE}/api/download/${id}`, { method: 'DELETE' })
        await get().fetchTasks()
        // 从选中列表中移除
        const { selectedTaskIds } = get()
        if (selectedTaskIds.includes(id)) {
          set({ selectedTaskIds: selectedTaskIds.filter(i => i !== id) })
        }
      },

      clearCompleted: async () => {
        await fetch(`${API_BASE}/api/downloads/clear`, { method: 'DELETE' })
        await get().fetchTasks()
        set({ selectedTaskIds: [] })
      },

      // UI 方法
      setSelectedTasks: (ids) => set({ selectedTaskIds: ids }),

      toggleTaskSelection: (id) => {
        const { selectedTaskIds } = get()
        if (selectedTaskIds.includes(id)) {
          set({ selectedTaskIds: selectedTaskIds.filter(i => i !== id) })
        } else {
          set({ selectedTaskIds: [...selectedTaskIds, id] })
        }
      },

      selectAllTasks: () => {
        const filteredTasks = get().getFilteredTasks()
        set({ selectedTaskIds: filteredTasks.map(t => t.id) })
      },

      clearSelection: () => set({ selectedTaskIds: [] }),

      setFilter: (filter) => {
        set({ taskFilter: filter, selectedTaskIds: [] })
      },

      toggleTheme: () => {
        const { theme } = get()
        set({ theme: theme === 'light' ? 'dark' : 'light' })
      },

      // 弹窗方法
      openNewTaskModal: () => set({ isNewTaskModalOpen: true }),
      closeNewTaskModal: () => set({ isNewTaskModalOpen: false }),
      openSettingsModal: () => set({ isSettingsModalOpen: true }),
      closeSettingsModal: () => set({ isSettingsModalOpen: false }),
      openBatchAddModal: () => set({ isBatchAddModalOpen: true }),
      closeBatchAddModal: () => set({ isBatchAddModalOpen: false }),

      // 设置方法
      updateSettings: (newSettings) => {
        set({ settings: { ...get().settings, ...newSettings } })
      },

      // 批量操作
      pauseSelected: async () => {
        const { selectedTaskIds, tasks } = get()
        const downloadableIds = selectedTaskIds.filter(id => {
          const task = tasks.find(t => t.id === id)
          return task && ['downloading', 'downloading_key', 'pending'].includes(task.status)
        })
        await Promise.all(downloadableIds.map(id => get().pauseTask(id)))
        set({ selectedTaskIds: [] })
      },

      resumeSelected: async () => {
        const { selectedTaskIds, tasks } = get()
        const pausedIds = selectedTaskIds.filter(id => {
          const task = tasks.find(t => t.id === id)
          return task && task.status === 'paused'
        })
        await Promise.all(pausedIds.map(id => get().resumeTask(id)))
        set({ selectedTaskIds: [] })
      },

      deleteSelected: async () => {
        const { selectedTaskIds } = get()
        await Promise.all(selectedTaskIds.map(id => get().deleteTask(id)))
        set({ selectedTaskIds: [] })
      },

      retrySelected: async () => {
        const { selectedTaskIds, tasks } = get()
        const errorIds = selectedTaskIds.filter(id => {
          const task = tasks.find(t => t.id === id)
          return task && task.status === 'error'
        })
        // TODO: 后端需要实现重试 API
        // await Promise.all(errorIds.map(id => get().retryTask(id)))
        console.log('Retry tasks:', errorIds)
        set({ selectedTaskIds: [] })
      },

      // 批量添加
      addBatchTasks: async (urls, outputPath, referer) => {
        set({ isLoading: true })
        try {
          const promises = urls.map(url => {
            const filename = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '_' + Math.random().toString(36).slice(2, 7)
            const fullPath = `${outputPath}/${filename}.mp4`
            return get().startDownload(url.trim(), fullPath, referer)
          })
          await Promise.all(promises)
        } finally {
          set({ isLoading: false })
        }
      },

      // 辅助方法
      getFilteredTasks: () => {
        const { tasks, taskFilter } = get()
        switch (taskFilter) {
          case 'downloading':
            return tasks.filter(t => ['pending', 'downloading', 'downloading_key', 'merging'].includes(t.status))
          case 'completed':
            return tasks.filter(t => t.status === 'completed')
          case 'error':
            return tasks.filter(t => t.status === 'error')
          case 'paused':
            return tasks.filter(t => t.status === 'paused')
          default:
            return tasks
        }
      },

      getTaskCounts: () => {
        const { tasks } = get()
        return {
          all: tasks.length,
          downloading: tasks.filter(t => ['pending', 'downloading', 'downloading_key', 'merging'].includes(t.status)).length,
          completed: tasks.filter(t => t.status === 'completed').length,
          error: tasks.filter(t => t.status === 'error').length,
          paused: tasks.filter(t => t.status === 'paused').length,
        }
      },
    }),
    {
      name: 'm3u8-downloader-settings',
      partialize: (state) => ({
        theme: state.theme,
        settings: state.settings,
      }),
    }
  )
)
