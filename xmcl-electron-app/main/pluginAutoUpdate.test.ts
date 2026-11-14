import { afterEach, describe, expect, it, vi } from 'vitest'
const autoUpdater = vi.hoisted(() => ({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false, setFeedURL: vi.fn() } as Record<string, any>))
const host = (env: string, os = 'linux') => ({ env, platform: { os }, getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) })
vi.mock('electron-updater', () => ({ autoUpdater }))
vi.mock('~/settings', () => ({ kSettings: Symbol('settings') }))
import { pluginAutoUpdate } from './pluginAutoUpdate'

describe('auto-update settings wiring', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('initializes persisted self-managed preferences, then disables a downloaded update on switching external', async () => {
    vi.stubEnv('XMCL_E2E', '')
    vi.stubEnv('APPIMAGE', '/opt/xmcl.AppImage')
    const handlers: Record<string, (value: any) => void> = {}
    const state = {
      appImageUpdateMode: 'self-managed', autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false,
      updateStatusSet: vi.fn(),
      subscribe: vi.fn((name, handler) => { handlers[name] = handler; return state }),
    }
    await pluginAutoUpdate({ ...host('appimage'), registry: { get: async () => state } } as any, {} as any)
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    state.appImageUpdateMode = 'external'
    handlers.appImageUpdateModeSet('external')
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(state.updateStatusSet).toHaveBeenCalledWith('none')
    state.appImageUpdateMode = 'self-managed'
    handlers.appImageUpdateModeSet('self-managed')
    expect(autoUpdater.autoDownload).toBe(true)
    vi.stubEnv('APPIMAGE', '/opt/xmcl-0.73.0.AppImage')
    handlers.config(state)
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
  })
  it.each(['appimage', 'raw'])('applies initial state and subsequent mutations for %s', async (env) => {
    vi.stubEnv('XMCL_E2E', '')
    const handlers: Record<string, (value: any) => void> = {}
    const state = {
      autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false,
      subscribe: vi.fn((name, handler) => { handlers[name] = handler; return state }),
    }
    autoUpdater.autoDownload = autoUpdater.autoInstallOnAppQuit = true
    let resolve!: (value: typeof state) => void
    const waiting = new Promise<typeof state>((r) => { resolve = r })
    const initialized = pluginAutoUpdate({ ...host(env), registry: { get: () => waiting } } as any, {} as any)
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    resolve(state)
    await initialized
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    handlers.config({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true })
    expect(autoUpdater.autoDownload).toBe(env !== 'appimage')
    expect(autoUpdater.autoInstallOnAppQuit).toBe(env !== 'appimage')
    handlers.autoDownloadSet(true)
    expect(autoUpdater.autoDownload).toBe(env !== 'appimage')
    handlers.autoInstallOnAppQuitSet(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(env !== 'appimage')
    handlers.allowPrereleaseSet(false)
    expect(autoUpdater.allowPrerelease).toBe(false)
  })

  it('always installs a downloaded update on quit on Windows and leaves the download to BaseService', async () => {
    vi.stubEnv('XMCL_E2E', '')
    const handlers: Record<string, (value: any) => void> = {}
    const state = {
      autoDownload: true, autoInstallOnAppQuit: false, allowPrerelease: false,
      subscribe: vi.fn((name, handler) => { handlers[name] = handler; return state }),
    }
    await pluginAutoUpdate({ ...host('raw', 'windows'), registry: { get: async () => state } } as any, {} as any)
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(autoUpdater.disableWebInstaller).toBe(true)
    handlers.config({ autoDownload: true, autoInstallOnAppQuit: false, allowPrerelease: false })
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled()
  })

  it('reads updates from HORIZON_UPDATE_URL when it is set', async () => {
    vi.stubEnv('XMCL_E2E', '')
    vi.stubEnv('HORIZON_UPDATE_URL', 'http://127.0.0.1:47123/')
    const state = { autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, subscribe: vi.fn(() => state) }
    await pluginAutoUpdate({ ...host('raw', 'windows'), registry: { get: async () => state } } as any, {} as any)
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({ provider: 'generic', url: 'http://127.0.0.1:47123/' })
  })
})
