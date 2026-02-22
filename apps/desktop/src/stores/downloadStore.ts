import { create } from 'zustand'

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
}

interface DownloadStore {
  tasks: DownloadTask[]
  isLoading: boolean

  fetchTasks: () => Promise<void>
  startDownload: (url: string, outputPath: string, referer?: string) => Promise<void>
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: [],
  isLoading: false,

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

  clearCompleted: async () => {
    await fetch(`${API_BASE}/api/downloads/clear`, { method: 'DELETE' })
    await get().fetchTasks()
  },
}))
