import { open } from '@tauri-apps/plugin-dialog'
import { Sun, Moon, FolderOpen, Film } from 'lucide-react'
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

          {/* 分段合成设置 */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Film size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              分段合成
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <span className="settings-label-text">自动合成预览</span>
                <span className="settings-label-hint">下载时自动生成可播放的预览文件</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.previewConfig.autoMerge}
                  onChange={(e) => updateSettings({
                    previewConfig: { ...settings.previewConfig, autoMerge: e.target.checked }
                  })}
                />
                <span className="switch-slider" />
              </label>
            </div>

            {settings.previewConfig.autoMerge && (
              <>
                <div className="settings-row">
                  <div className="settings-label">
                    <span className="settings-label-text">触发条件</span>
                    <span className="settings-label-hint">何时自动合成预览</span>
                  </div>
                  <select
                    className="form-select"
                    value={settings.previewConfig.triggerMode}
                    onChange={(e) => updateSettings({
                      previewConfig: {
                        ...settings.previewConfig,
                        triggerMode: e.target.value as 'percentage' | 'segments'
                      }
                    })}
                    style={{ width: '120px' }}
                  >
                    <option value="percentage">按百分比</option>
                    <option value="segments">按分片数</option>
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <span className="settings-label-text">
                      {settings.previewConfig.triggerMode === 'percentage' ? '合成间隔 (%)' : '合成间隔 (分片数)'}
                    </span>
                    <span className="settings-label-hint">
                      {settings.previewConfig.triggerMode === 'percentage'
                        ? '每下载多少百分比合成一次'
                        : '每下载多少分片合成一次'}
                    </span>
                  </div>
                  <input
                    type="number"
                    className="form-input form-input-number"
                    value={settings.previewConfig.triggerValue}
                    onChange={(e) => updateSettings({
                      previewConfig: {
                        ...settings.previewConfig,
                        triggerValue: Math.max(
                          10,
                          Math.min(
                            settings.previewConfig.triggerMode === 'percentage' ? 50 : 500,
                            parseInt(e.target.value) || 25
                          )
                        )
                      }
                    })}
                    min={10}
                    max={settings.previewConfig.triggerMode === 'percentage' ? 50 : 500}
                  />
                </div>
              </>
            )}

            <div className="settings-row">
              <div className="settings-label">
                <span className="settings-label-text">预览文件处理</span>
                <span className="settings-label-hint">下载完成后的预览文件处理方式</span>
              </div>
              <select
                className="form-select"
                value={settings.previewConfig.fileMode}
                onChange={(e) => updateSettings({
                  previewConfig: {
                    ...settings.previewConfig,
                    fileMode: e.target.value as 'temporary' | 'keep' | 'ask'
                  }
                })}
                style={{ width: '140px' }}
              >
                <option value="ask">每次询问</option>
                <option value="temporary">临时预览（自动删除）</option>
                <option value="keep">独立保存</option>
              </select>
            </div>
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
