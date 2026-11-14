import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getFeedURL: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(), openExternal: vi.fn(),
}))
vi.mock('electron', () => ({ app: {}, shell: { openExternal: mocks.openExternal } }))
vi.mock('electron-updater', () => ({
  autoUpdater: mocks,
  UpdaterSignal: class { progress() {} },
  CancellationToken: class { cancel() {} },
}))
vi.mock('~/infra', () => ({ kGFW: Symbol('gfw') }))
vi.mock('~/settings', () => ({ kSettings: Symbol('settings') }))
vi.mock('./elevate', () => ({ ensureElevateExe: vi.fn() }))
import { ElectronUpdater, HORIZON_LAUNCHER_REPO, isNewerVersion } from './updater'

const staleRelease = { name: '0.74.0', date: '', body: '', files: [], newUpdate: true, operation: 'autoupdater' }
function createApp(env = 'appimage', os = 'linux') {
  return {
    env, version: '0.73.0', platform: { os },
    getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    registry: { get: vi.fn<() => Promise<any>>().mockResolvedValue({ allowPrerelease: false, locale: 'en' }) },
    fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      tag_name: 'v0.74.0', body: 'notes', published_at: '', assets: [
        { name: 'app-0.74.0-linux.asar', browser_download_url: 'https://example.test/update' },
      ],
    }) }),
  }
}

describe('AppImage external update boundary', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())
  it('retains self-managed stable-path discovery and explicit installation; blocks after mode switch', async () => {
    vi.stubEnv('APPIMAGE', '/opt/xmcl.AppImage')
    const settings = { appImageUpdateMode: 'self-managed' }
    const app = createApp()
    app.registry.get.mockResolvedValue(settings)
    mocks.checkForUpdates.mockResolvedValue({ updateInfo: { version: '0.74.0', releaseNotes: '', releaseDate: '', files: [] } })
    const updater = new ElectronUpdater(app as any)
    expect(await updater.checkUpdateTask()).toMatchObject({ operation: 'autoupdater' })
    await updater.downloadUpdate(staleRelease)
    expect(mocks.downloadUpdate).toHaveBeenCalledOnce()
    await updater.installUpdateAndQuit(staleRelease)
    expect(mocks.quitAndInstall).toHaveBeenCalledOnce()
    settings.appImageUpdateMode = 'external'
    mocks.downloadUpdate.mockClear()
    mocks.quitAndInstall.mockClear()
    await updater.downloadUpdate(staleRelease)
    await updater.installUpdateAndQuit(staleRelease)
    expect(mocks.downloadUpdate).not.toHaveBeenCalled()
    expect(mocks.quitAndInstall).not.toHaveBeenCalled()
    expect(await updater.checkUpdateTask()).toMatchObject({ operation: 'manual' })
  })
  it('keeps self-managed versioned paths manual and blocks stale Asar installation', async () => {
    vi.stubEnv('APPIMAGE', '/opt/xmcl-0.73.0.AppImage')
    const app = createApp()
    app.registry.get.mockResolvedValue({ appImageUpdateMode: 'self-managed' })
    const updater = new ElectronUpdater(app as any)
    expect(await updater.checkUpdateTask()).toMatchObject({ operation: 'manual' })
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
    vi.stubEnv('APPIMAGE', '/opt/xmcl.AppImage')
    await updater.installUpdateAndQuit({ ...staleRelease, operation: 'asar' })
    expect(mocks.quitAndInstall).not.toHaveBeenCalled()
  })
  it('discovers metadata as manual without invoking electron-updater', async () => {
    const app = createApp()
    const updater = new ElectronUpdater(app as any)
    expect(await updater.checkUpdateTask()).toMatchObject({ operation: 'manual', newUpdate: true })
    expect(app.fetch).toHaveBeenCalledOnce()
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
  })
  it('retains the Linux self-update discovery path outside AppImage', async () => {
    mocks.checkForUpdates.mockResolvedValue({ updateInfo: { version: '0.74.0', releaseNotes: '', releaseDate: '', files: [] } })
    const app = createApp('raw')
    expect(await new ElectronUpdater(app as any).checkUpdateTask()).toMatchObject({ operation: 'autoupdater' })
    expect(mocks.checkForUpdates).toHaveBeenCalledOnce()
    expect(app.fetch).not.toHaveBeenCalled()
  })
  it.each(['autoupdater', 'asar', 'manual'])('blocks download and install for cached %s releases', async (operation) => {
    const updater = new ElectronUpdater(createApp() as any)
    const release = { ...staleRelease, operation }
    await updater.downloadUpdate(release)
    await updater.installUpdateAndQuit(release)
    expect(mocks.downloadUpdate).not.toHaveBeenCalled()
    expect(mocks.quitAndInstall).not.toHaveBeenCalled()
    expect(mocks.openExternal).toHaveBeenCalledTimes(2)
  })
})

describe('Horizon Client updates (GitHub releases of the launcher repository)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())
  const latest = (version: string, isUpdateAvailable: boolean) => ({
    isUpdateAvailable,
    updateInfo: { version, releaseNotes: 'notes', releaseDate: '', files: [{ url: `horizon-client-${version}-setup.exe` }] },
  })

  it('updates the installed Windows build through electron-updater', async () => {
    mocks.checkForUpdates.mockResolvedValue(latest('1.0.1', true))
    const app = createApp('raw', 'windows')
    const updater = new ElectronUpdater(app as any)
    expect(await updater.checkUpdateTask()).toMatchObject({ name: '1.0.1', operation: 'autoupdater', newUpdate: true })
    expect(app.fetch).not.toHaveBeenCalled()
    const release = await updater.checkUpdateTask()
    await updater.downloadUpdate(release)
    expect(mocks.downloadUpdate).toHaveBeenCalledOnce()
    await updater.installUpdateAndQuit(release)
    // Silent install, then the new version starts.
    expect(mocks.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it("takes electron-updater's word that an older or equal release is no update", async () => {
    mocks.checkForUpdates.mockResolvedValue(latest('0.72.0', false))
    const updater = new ElectronUpdater(createApp('raw', 'windows') as any)
    expect(await updater.checkUpdateTask()).toMatchObject({ newUpdate: false })
  })

  it('sends the portable exe to the release page instead of installing', async () => {
    vi.stubEnv('PORTABLE_EXECUTABLE_FILE', 'C:/Games/horizon-client-0.73.0-portable.exe')
    const app = createApp('raw', 'windows')
    const updater = new ElectronUpdater(app as any)
    const release = await updater.checkUpdateTask()
    expect(release).toMatchObject({ name: 'v0.74.0', operation: 'manual', newUpdate: true })
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
    expect(app.fetch).toHaveBeenCalledWith(`https://api.github.com/repos/${HORIZON_LAUNCHER_REPO}/releases/latest`, expect.anything())
    await updater.downloadUpdate(release)
    expect(mocks.downloadUpdate).not.toHaveBeenCalled()
    expect(mocks.openExternal).toHaveBeenCalledWith(`https://github.com/${HORIZON_LAUNCHER_REPO}/releases/latest`)
  })

  it('falls back to the release page for a build without app-update.yml', async () => {
    mocks.checkForUpdates.mockRejectedValue(Object.assign(new Error('ENOENT: no such file, open app-update.yml'), { code: 'ENOENT', errno: -4058 }))
    const app = createApp('raw', 'windows')
    expect(await new ElectronUpdater(app as any).checkUpdateTask()).toMatchObject({ operation: 'manual', newUpdate: true })
    expect(app.fetch).toHaveBeenCalledOnce()
  })

  it('reads prereleases from the release list when they are allowed', async () => {
    vi.stubEnv('PORTABLE_EXECUTABLE_FILE', 'x.exe')
    const app = createApp('raw', 'windows')
    app.registry.get.mockResolvedValue({ allowPrerelease: true })
    app.fetch.mockResolvedValue({ ok: true, json: async () => [
      { draft: true, tag_name: 'v2.0.0', assets: [] },
      { draft: false, tag_name: 'v1.1.0-beta.1', body: '', published_at: '', assets: [] },
    ] })
    expect(await new ElectronUpdater(app as any).checkUpdateTask()).toMatchObject({ name: 'v1.1.0-beta.1', newUpdate: true })
    expect(app.fetch).toHaveBeenCalledWith(`https://api.github.com/repos/${HORIZON_LAUNCHER_REPO}/releases?per_page=10`, expect.anything())
  })

  it('checks nothing with HORIZON_DISABLE_UPDATES', async () => {
    vi.stubEnv('HORIZON_DISABLE_UPDATES', '1')
    const app = createApp('raw', 'windows')
    expect(await new ElectronUpdater(app as any).checkUpdateTask()).toMatchObject({ newUpdate: false })
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
    expect(app.fetch).not.toHaveBeenCalled()
  })

  it('compares versions as semver', () => {
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.73.1', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.1.0-beta.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('garbage', '1.0.0')).toBe(false)
  })
})
