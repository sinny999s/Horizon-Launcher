import { LauncherAppPlugin } from '@xmcl/runtime/app'
import { autoUpdater } from 'electron-updater'
import { kSettings } from '~/settings'
import { applyAutoUpdateSettings } from './utils/appImageUpdatePolicy'

export const pluginAutoUpdate: LauncherAppPlugin = async (app) => {
  // E2E hook: skip the auto-updater entirely when running under Playwright.
  // The updater hits real network endpoints and would otherwise add nondeterminism.
  if (process.env.XMCL_E2E) {
    return
  }
  // Horizon Client: electron-updater's own log lines go to the launcher's log.
  const logger = app.getLogger('AutoUpdater')
  autoUpdater.logger = { info: (m: any) => logger.log(m), warn: (m: any) => logger.warn(m), error: (m: any) => logger.error(m), debug: () => { } }
  // Horizon Client: only the full installer is published, never a web installer.
  autoUpdater.disableWebInstaller = true
  // Horizon Client: HORIZON_UPDATE_URL points the updater at another feed (a folder with latest.yml), for testing.
  if (process.env.HORIZON_UPDATE_URL) {
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.HORIZON_UPDATE_URL })
  }
  // electron-updater defaults to automatic download/install. Disable both before
  // awaiting settings so a persisted opt-out (or AppImage policy) is effective.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  const state = await app.registry.get(kSettings)
  /**
   * Horizon Client: on Windows a downloaded update always installs when the launcher quits. BaseService
   * downloads it as soon as it's found (as a task), so electron-updater's own autoDownload stays off.
   * XMCL's two settings for this are only shown for AppImages.
   */
  const apply = (settings: Parameters<typeof applyAutoUpdateSettings>[1]) => {
    applyAutoUpdateSettings(autoUpdater, settings, app.env)
    if (app.platform.os === 'windows') {
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true
    }
  }
  apply(state)
  state.subscribe('autoInstallOnAppQuitSet', (value) => {
    apply({ ...state, autoInstallOnAppQuit: value })
  }).subscribe('allowPrereleaseSet', (value) => {
    autoUpdater.allowPrerelease = value
  }).subscribe('autoDownloadSet', (value) => {
    apply({ ...state, autoDownload: value })
  }).subscribe('appImageUpdateModeSet', (mode) => {
    apply({ ...state, appImageUpdateMode: mode })
    // Force fresh discovery rather than offering an action from the old mode.
    if (app.env === 'appimage') state.updateStatusSet('none')
  }).subscribe('config', (config) => {
    apply(config)
  })
}
