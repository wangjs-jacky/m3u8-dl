/**
 * 格式化日期时间
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '--'

  try {
    const date = new Date(dateString)

    // 检查是否是有效日期
    if (isNaN(date.getTime())) return dateString

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  } catch {
    return dateString
  }
}

/**
 * 格式化文件大小
 */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '--'

  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let size = bytes

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 格式化时长（秒转 mm:ss 或 hh:mm:ss）
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
