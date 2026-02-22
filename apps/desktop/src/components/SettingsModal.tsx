import { open } from '@tauri-apps/plugin-dialog'
import { Sun, Moon, FolderOpen } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'

export function SettingsModal() {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    theme,
    toggleTheme,
    settings,
    updateSettings,
  } = useDownloadStore()

  if (!isSettingsModalOpen) return null

  const handleBrowseDefaultPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: settings.defaultOutputPath,
    })
    if (selected) {
      updateSettings({ defaultOutputPath: selected as string })
    }
  }

  return (
    <div className="modal-overlay" onClick={closeSettingsModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">设置</h2>
          <button className="modal-close" onClick={closeSettingsModal}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* 外观设置 */}
          <div className="settings-section">
            <div className="settings-section-title">外观</div>
            <div className="theme-selector">
              <div
                className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                onClick={() => theme !== 'light' && toggleTheme()}
              >
                <div className="theme-option-icon"><Sun size={24} /></div>
                <div className="theme-option-label">浅色模式</div>
              </div>
              <div
                className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => theme !== 'dark' && toggleTheme()}
              >
                <div className="theme-option-icon"><Moon size={24} /></div>
                <div className="theme-option-label">深色模式</div>
              </div>
            </div>
          </div>

          {/* 下载设置 */}
          <div className="settings-section">
            <div className="settings-section-title">下载</div>

            <div className="settings-row">
              <div className="settings-label">
                <span className="settings-label-text">默认下载路径</span>
                <span className="settings-label-hint">新建任务时的默认保存位置</span>
              </div>
              <div className="form-input-group" style={{ width: '200px' }}>
                <input
                  type="text"
                  className="form-input"
                  value={settings.defaultOutputPath}
                  onChange={(e) => updateSettings({ defaultOutputPath: e.target.value })}
                  style={{ fontSize: '13px' }}
                />
                <button className="btn btn-icon" onClick={handleBrowseDefaultPath}>
                  <FolderOpen size={16} />
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <span className="settings-label-text">并发连接数</span>
                <span className="settings-label-hint">同时下载的分片数量</span>
              </div>
              <input
                type="number"
                className="form-input form-input-number"
                value={settings.maxConcurrent}
                onChange={(e) =>
                  updateSettings({
                    maxConcurrent: Math.max(1, Math.min(32, parseInt(e.target.value) || 8)),
                  })
                }
                min={1}
                max={32}
              />
            </div>
          </div>

          {/* 重试设置 */}
          <div className="settings-section">
            <div className="settings-section-title">重试</div>

            <div className="settings-row">
              <div className="settings-label">
                <span className="settings-label-text">自动重试</span>
                <span className="settings-label-hint">下载失败时自动重试</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.autoRetry}
                  onChange={(e) => updateSettings({ autoRetry: e.target.checked })}
                />
                <span className="switch-slider" />
              </label>
            </div>

            {settings.autoRetry && (
              <>
                <div className="settings-row">
                  <div className="settings-label">
                    <span className="settings-label-text">重试次数</span>
                    <span className="settings-label-hint">失败后最多重试的次数</span>
                  </div>
                  <input
                    type="number"
                    className="form-input form-input-number"
                    value={settings.retryCount}
                    onChange={(e) =>
                      updateSettings({
                        retryCount: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)),
                      })
                    }
                    min={1}
                    max={10}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <span className="settings-label-text">重试间隔（秒）</span>
                    <span className="settings-label-hint">每次重试之间的等待时间</span>
                  </div>
                  <input
                    type="number"
                    className="form-input form-input-number"
                    value={settings.retryDelay}
                    onChange={(e) =>
                      updateSettings({
                        retryDelay: Math.max(1, Math.min(60, parseInt(e.target.value) || 5)),
                      })
                    }
                    min={1}
                    max={60}
                  />
                </div>
              </>
            )}
          </div>

          {/* 代理设置 */}
          <div className="settings-section">
            <div className="settings-section-title">代理</div>

            <div className="settings-row">
              <div className="settings-label">
                <span className="settings-label-text">启用代理</span>
                <span className="settings-label-hint">通过代理服务器下载</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.proxyEnabled}
                  onChange={(e) => updateSettings({ proxyEnabled: e.target.checked })}
                />
                <span className="switch-slider" />
              </label>
            </div>

            {settings.proxyEnabled && (
              <div className="settings-row">
                <div className="settings-label">
                  <span className="settings-label-text">代理地址</span>
                  <span className="settings-label-hint">HTTP/SOCKS5 代理服务器地址</span>
                </div>
                <input
                  type="text"
                  className="form-input"
                  value={settings.proxyUrl}
                  onChange={(e) => updateSettings({ proxyUrl: e.target.value })}
                  placeholder="http://127.0.0.1:7890"
                  style={{ width: '200px', fontSize: '13px' }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={closeSettingsModal}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
