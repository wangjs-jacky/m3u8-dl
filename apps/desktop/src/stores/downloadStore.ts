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

export interface PreviewConfig {
  autoMerge: boolean
  triggerMode: 'percentage' | 'segments' | 'disabled'
  triggerValue: number
  fileMode: 'temporary' | 'keep' | 'ask'
}

export interface PreviewFile {
  file: string
  path: string
  segments: number
  duration: string
  createdAt: string
  mode: 'temporary' | 'keep' | 'ask'
}

export interface DownloadTask {
  id: string
  url: string
  outputPath: string
  progress: number
  status: DownloadStatus
  message: string
  error?: string
  referer?: string
  createdAt: string
  timestamp: string
  // 扩展字段
  speed?: string
  eta?: string
  totalSize?: number
  downloadedSize?: number
  // 分片信息
  totalSegments?: number
  downloadedSegments?: number
  // 临时目录
  tempDir?: string
  // 预览相关字段
  previews?: PreviewFile[]
  isMergingPreview?: boolean
  lastPreviewAt?: string
}

export interface AppSettings {
  defaultOutputPath: string
  maxConcurrent: number
  proxyEnabled: boolean
  proxyUrl: string
  autoRetry: boolean
  retryCount: number
  retryDelay: number
  previewConfig: PreviewConfig
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
  detailTaskId: string | null  // 详情模态框任务 ID

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
  refreshTask: (id: string) => Promise<{ wasStuck: boolean; message: string }>

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
  openDetailModal: (taskId: string) => void
  closeDetailModal: () => void
  getDetailTask: () => DownloadTask | null

  // 设置方法
  updateSettings: (settings: Partial<AppSettings>) => void
  syncConfigToServer: () => Promise<void>

  // 批量操作
  pauseSelected: () => Promise<void>
  resumeSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  retrySelected: () => Promise<void>

  // 批量添加
  addBatchTasks: (urls: string[], outputPath: string, referer?: string) => Promise<void>

  // 预览方法
  createPreview: (id: string, mode?: 'temporary' | 'keep') => Promise<void>

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
  previewConfig: {
    autoMerge: false,
    triggerMode: 'disabled',
    triggerValue: 25,
    fileMode: 'ask',
  },
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
      detailTaskId: null,
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

      refreshTask: async (id: string) => {
        try {
          const response = await fetch(`${API_BASE}/api/download/${id}/refresh`, { method: 'POST' })
          if (response.ok) {
            const result = await response.json()
            await get().fetchTasks()
            return {
              wasStuck: result.task?.wasStuck || false,
              message: result.task?.message || '刷新成功'
            }
          } else {
            const error = await response.json()
            throw new Error(error.error || '刷新失败')
          }
        } catch (error: any) {
          console.error('Failed to refresh task:', error)
          throw error
        }
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
      openDetailModal: (taskId: string) => set({ detailTaskId: taskId }),
      closeDetailModal: () => set({ detailTaskId: null }),
      getDetailTask: () => {
        const { tasks, detailTaskId } = get()
        if (!detailTaskId) return null
        return tasks.find(t => t.id === detailTaskId) || null
      },

      // 设置方法
      updateSettings: (newSettings) => {
        set({ settings: { ...get().settings, ...newSettings } })
        // 同步配置到服务端
        get().syncConfigToServer()
      },

      syncConfigToServer: async () => {
        const { settings } = get()
        try {
          await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              defaultOutputPath: settings.defaultOutputPath,
            }),
          })
        } catch (error) {
          console.error('Failed to sync config:', error)
        }
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

      // 预览方法
      createPreview: async (id, mode = 'temporary') => {
        try {
          const response = await fetch(`${API_BASE}/api/download/${id}/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode }),
          })
          if (response.ok) {
            await get().fetchTasks()
          } else {
            const error = await response.json()
            throw new Error(error.error || '创建预览失败')
          }
        } catch (error) {
          console.error('Failed to create preview:', error)
          throw error
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
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as any),
        settings: {
          ...current.settings,
          ...((persisted as any)?.settings || {}),
          // 确保 previewConfig 有默认值
          previewConfig: {
            ...current.settings.previewConfig,
            ...((persisted as any)?.settings?.previewConfig || {}),
          },
        },
      }),
    }
  )
)
