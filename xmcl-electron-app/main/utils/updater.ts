import { HAS_DEV_SERVER } from '../constant'
import {
  DownloadBaseOptions,
  ProgressTracker,
  download,
  getDownloadBaseOptions,
} from '@xmcl/file-transfer'
import { Tracker, onDownloadSingle } from '@xmcl/installer'
import {
  DownloadUpdateTrackerEvents,
  ElectronUpdateOperation,
  ReleaseInfo,
} from '@xmcl/runtime-api'
import { DownloadUpdateOptions, LauncherAppUpdater } from '@xmcl/runtime/app'
import { AnyError, isSystemError } from '@xmcl/utils'
import { spawn } from 'child_process'
import { app, shell } from 'electron'
import * as updater from 'electron-updater'
import { AppUpdater, CancellationToken, UpdaterSignal } from 'electron-updater'
import { createReadStream, createWriteStream } from 'fs'
import { readFile, rename as renameAsync, unlink as unlinkAsync, writeFile } from 'fs-extra'
import { closeSync, existsSync, open, rename, unlink } from 'original-fs'
import { platform } from 'os'
import { basename, dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { setTimeout } from 'timers/promises'
import { extract as extractTar } from 'tar-stream'
import { promisify } from 'util'
import { createGunzip } from 'zlib'
import { Logger, kGFW } from '~/infra'
import { kSettings } from '~/settings'
import { checksum } from '~/util/fs'
import type ElectronLauncherApp from '../ElectronLauncherApp'
import { ensureElevateExe } from './elevate'
import { isExternallyUpdatedAppImage } from './appImageUpdatePolicy'
import { gt as semverGt, valid as semverValid } from 'semver'

/**
 * Horizon Client: the GitHub repository whose releases carry the launcher: the NSIS installer, its blockmap and
 * `latest.yml` (read by electron-updater, see `publish` in build/electron-builder.config.ts) and the portable exe.
 */
export const HORIZON_LAUNCHER_REPO = 'sinny999s/Horizon-Launcher'
const HORIZON_RELEASES_PAGE = `https://github.com/${HORIZON_LAUNCHER_REPO}/releases/latest`

/** Whether `latest` is a newer version than `current` ("v" prefixes allowed). */
export function isNewerVersion(latest: string, current: string) {
  const a = semverValid(latest.replace(/^v/, ''))
  const b = semverValid(current.replace(/^v/, ''))
  return !!a && !!b && semverGt(a, b)
}

/** The portable exe can't replace itself: electron-builder's portable launcher sets this variable. */
function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_FILE
}

/**
 * Only download asar file update.
 *
 * If the this update is not a full update but an incremental update,
 * you can call this to download asar update
 */
async function downloadAsarUpdate(
  app: ElectronLauncherApp,
  destination: string,
  version: string,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  version = version.startsWith('v') ? version.substring(1) : version
  const pl = platform()
  let platformFlag = pl === 'win32' ? 'win' : pl === 'darwin' ? 'mac' : 'linux'
  if (process.arch === 'arm64') {
    platformFlag += '-arm64'
  } else if (process.arch === 'ia32') {
    platformFlag += '-ia32'
  }
  const file = `app-${version}-${platformFlag}.asar`
  const github = `https://github.com/Voxelum/x-minecraft-launcher/releases/download/v${version}/${file}`

  // Skip the download entirely if the pending file already matches the
  // published checksum.
  try {
    const sha256Response = await app.fetch(github + '.sha256', { signal: options?.abortSignal })
    const sha256 = sha256Response.ok ? (await sha256Response.text()).trim() : ''
    const actual = await checksum(destination, 'sha256').catch(() => '')
    if (sha256 && sha256 === actual) {
      return
    }
  } catch {
    // Ignore — fall through to download.
  }

  const gfw = await app.registry.get(kGFW)
  const errors: Error[] = []

  const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

  // Inside the GFW, pull the asar from the npmmirror tarball of the
  // per-platform `@xmcl/app-<platform>` package. npmmirror's per-file
  // (`/files/`) endpoint is whitelist-only, but package tarballs are
  // unrestricted, so we download the (small) tarball and extract `app.asar`.
  if (gfw.inside) {
    const tarball = `https://registry.npmmirror.com/@xmcl/app-${platformFlag}/-/app-${platformFlag}-${version}.tgz`
    try {
      await downloadAsarFromTarball(app, tarball, destination, options)
      return
    } catch (e) {
      if (isAbort(e)) return
      errors.push(Object.assign(e as Error, { name: 'UpdateAsarError', url: tarball }))
    }
  }

  // Fall back to the GitHub release asset (gzipped when available).
  try {
    await downloadGzAsar(app, github, destination, options)
    return
  } catch (e) {
    if (isAbort(e)) return
    errors.push(Object.assign(e as Error, { name: 'UpdateAsarError', url: github }))
  }

  throw new AggregateError(
    errors.flatMap((e) => (e instanceof AggregateError ? e.errors : e)),
    'Fail to download asar update',
  )
}

/**
 * Download an npm package tarball and extract its `package/app.asar` entry to
 * `destination`. Used for the npmmirror mirror path (see `downloadAsarUpdate`).
 */
async function downloadAsarFromTarball(
  app: ElectronLauncherApp,
  url: string,
  destination: string,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  const tempTgz = destination + '.tgz'
  await download({
    url,
    destination: tempTgz,
    tracker: onDownloadSingle(options?.tracker, 'download-update.asar', { url }),
    signal: options?.abortSignal,
    ...getDownloadBaseOptions(options),
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const tar = extractTar()
      let found = false
      tar.on('entry', (header, stream, next) => {
        if (!found && (header.name === 'package/app.asar' || header.name.endsWith('/app.asar'))) {
          found = true
          const out = createWriteStream(destination)
          out.on('error', reject)
          out.on('finish', next)
          stream.pipe(out)
        } else {
          stream.on('end', next)
          stream.on('error', reject)
          stream.resume()
        }
      })
      tar.on('error', reject)
      tar.on('finish', () => {
        if (found) resolve()
        else reject(new AnyError('UpdateAsarError', `No app.asar found in tarball ${url}`))
      })
      createReadStream(tempTgz).pipe(createGunzip()).pipe(tar)
    })
  } finally {
    await unlinkAsync(tempTgz).catch(() => {})
  }
}

/**
 * Download a raw asar (or its `.gz` sibling when present) and write it to
 * `destination`. Used for the GitHub release-asset path.
 */
async function downloadGzAsar(
  app: ElectronLauncherApp,
  url: string,
  destination: string,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  const gzUrl = url + '.gz'
  const gzResponse = await app
    .fetch(gzUrl, { method: 'HEAD', signal: options?.abortSignal })
    .catch(() => null)
  const downloadUrl = gzResponse?.ok ? gzUrl : url

  const tempFile = destination + '.tmp'
  await download({
    url: downloadUrl,
    destination: tempFile,
    tracker: onDownloadSingle(options?.tracker, 'download-update.asar', { url: downloadUrl }),
    signal: options?.abortSignal,
    ...getDownloadBaseOptions(options),
  })

  if (downloadUrl === gzUrl) {
    await pipeline(createReadStream(tempFile), createGunzip(), createWriteStream(destination))
    await unlinkAsync(tempFile)
  } else {
    await renameAsync(tempFile, destination)
  }
}

async function hintUserDownload(): Promise<void> {
  shell.openExternal(HORIZON_RELEASES_PAGE)
}

async function downloadAppInstaller(
  launcherApp: ElectronLauncherApp,
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  const destination = join(app.getPath('downloads'), 'XMCL.appinstaller')
  const url = 'https://xmcl.blob.core.windows.net/releases/xmcl.appinstaller'

  await download({
    url,
    destination,
    tracker: onDownloadSingle(options?.tracker, 'download-update.appx', { url }),
    signal: options?.abortSignal,
    ...getDownloadBaseOptions(options),
  })

  shell.showItemInFolder(destination)
  await setTimeout(1000)
  await shell.openPath(destination)
  launcherApp.exit()
}

async function getUpdateAsarViaBatArgs(
  appAsarPath: string,
  updateAsarPath: string,
  appDataPath: string,
  elevatePath?: string,
): Promise<string[]> {
  const psPath = join(appDataPath, 'AutoUpdate.bat')
  await writeFile(
    psPath,
    [
      '@echo off',
      'chcp 65001',
      '%WinDir%\\System32\\timeout.exe 2',
      `taskkill /f /im "${basename(process.argv[0])}"`,
      `copy /Y "${updateAsarPath}" "${appAsarPath}"`,
      `start /b "" /d "${process.cwd()}" ${process.argv.map((s) => `"${s}"`).join(' ')}`,
    ].join('\r\n'),
  )

  return elevatePath ? [elevatePath, psPath] : ['cmd.exe', '/c', psPath]
}
/**
 * Download the full update. This size can be larger as it carry the whole electron thing...
 */
async function downloadFullUpdate(
  app: ElectronLauncherApp,
  appUpdater: AppUpdater,
  options?: {
    tracker?: Tracker<DownloadUpdateTrackerEvents>
    abortSignal?: AbortSignal
  },
): Promise<void> {
  // Horizon Client: no mirror. XMCL sent requests from inside China to a mirror of XMCL's own releases.
  const tracker: ProgressTracker = {
    progress: 0,
    total: 0,
    url: '',
  }
  options?.tracker?.({
    phase: 'download-update.full',
    payload: { progress: tracker },
  })

  const signal = new UpdaterSignal(appUpdater)
  signal.progress((info) => {
    tracker.progress = info.transferred
    tracker.total = info.total
    // tracker.speed = info.bytesPerSecond
  })

  const cancellationToken = new CancellationToken()
  options?.abortSignal?.addEventListener('abort', () => {
    cancellationToken.cancel()
  })
  await appUpdater.downloadUpdate(cancellationToken)
}

function isSameVersion(a: string, b: string) {
  if (a.startsWith('v')) {
    a = a.substring(1)
  }
  if (b.startsWith('v')) {
    b = b.substring(1)
  }
  return a === b
}

export class ElectronUpdater implements LauncherAppUpdater {
  private logger: Logger

  constructor(private app: ElectronLauncherApp) {
    this.logger = app.getLogger('ElectronUpdater')
  }

  /**
   * Horizon Client: reads the newest release of {@link HORIZON_LAUNCHER_REPO} from GitHub's API, for builds that
   * can't install it themselves (the portable exe, an unpacked build, macOS, an externally updated AppImage).
   * The update is offered as a download page. XMCL asked its own server here and could swap in a new app.asar.
   */
  async #getUpdateFromGitHub(): Promise<ReleaseInfo> {
    const app = this.app
    this.logger.log(`Check update from GitHub releases of ${HORIZON_LAUNCHER_REPO}`)
    const { allowPrerelease } = await app.registry.get(kSettings)
    const api = `https://api.github.com/repos/${HORIZON_LAUNCHER_REPO}/releases`
    const response = await app.fetch(allowPrerelease ? `${api}?per_page=10` : `${api}/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      throw new AnyError(
        'UpdateError',
        `Fail to get update from GitHub: ${await response.text()}`,
        {},
        { status: response.status },
      )
    }
    const body = (await response.json()) as any
    const result = Array.isArray(body) ? body.find((r: any) => !r.draft) : body
    if (!result) throw new Error('No update info found')
    const files = (result.assets ?? []).map((a: any) => ({
      url: a.browser_download_url,
      name: a.name,
    })) as Array<{ url: string; name: string }>
    const updateInfo: ReleaseInfo = {
      name: result.tag_name,
      body: result.body ?? '',
      date: result.published_at,
      files,
      newUpdate: isNewerVersion(result.tag_name, app.version),
      operation: ElectronUpdateOperation.Manual,
    }
    this.logger.log(`Latest release ${updateInfo.name} (new: ${updateInfo.newUpdate}), operation=manual`)
    return updateInfo
  }

  async #getUpdateFromAutoUpdater(): Promise<ReleaseInfo> {
    const autoUpdater = updater.autoUpdater

    this.logger.log(`Check update via ${autoUpdater.getFeedURL()}`)
    const info = await autoUpdater.checkForUpdates()
    if (!info) throw new Error('No update info found')

    const files = info.updateInfo.files.map((f) => ({ name: basename(f.url), url: f.url }))
    const release: ReleaseInfo = {
      name: info.updateInfo.version,
      body: info.updateInfo.releaseNotes as string,
      date: info.updateInfo.releaseDate,
      files,
      // Horizon Client: electron-updater's own answer (a newer version only, no downgrades).
      newUpdate: info.isUpdateAvailable ?? !isSameVersion(info.updateInfo.version, this.app.version),
      operation: ElectronUpdateOperation.AutoUpdater,
    }

    return release
  }

  private async quitAndInstallAsar() {
    const appAsarPath = join(dirname(__dirname), 'app.asar')
    const updateAsarPath = join(this.app.appDataPath, 'pending_update')

    this.logger.log(`Install asar on ${this.app.platform.os} ${appAsarPath}`)
    if (this.app.platform.os === 'windows') {
      const elevatePath = await ensureElevateExe(this.app.appDataPath)

      const appAsarPath = join(dirname(__dirname), 'app.asar')
      const updateAsarPath = join(this.app.appDataPath, 'pending_update')

      if (!existsSync(updateAsarPath)) {
        throw new Error(`No update found: ${updateAsarPath}`)
      }

      let hasWriteAccess = await new Promise((resolve) => {
        open(appAsarPath, 'a', (e, fd) => {
          if (e) {
            resolve(false)
          } else {
            closeSync(fd)
            resolve(true)
          }
        })
      })

      // force elevation for now
      hasWriteAccess = false
      this.logger.log(
        hasWriteAccess
          ? `Process has write access to ${appAsarPath}`
          : `Process does not have write access to ${appAsarPath}`,
      )

      const args = await getUpdateAsarViaBatArgs(
        appAsarPath,
        updateAsarPath,
        this.app.appDataPath,
        !hasWriteAccess ? elevatePath : undefined,
      )
      this.logger.log(`Install from windows: ${args.join(' ')}`)
      const x = spawn(args[0], args.slice(1), {
        cwd: this.app.appDataPath,
        detached: true,
        stdio: 'ignore',
      })
      x.unref()
      this.app.quit()
    } else {
      await promisify(rename)(appAsarPath, appAsarPath + '.bk').catch(() => {})
      try {
        try {
          await promisify(rename)(updateAsarPath, appAsarPath)
        } catch (e) {
          if (isSystemError(e) && e.code === 'EXDEV') {
            await writeFile(appAsarPath, await readFile(updateAsarPath))
          } else {
            throw e
          }
        }
        await promisify(unlink)(appAsarPath + '.bk').catch(() => {})
        this.app.relaunch()
      } catch (e) {
        this.logger.error(
          new AnyError('UpdateError', `Fail to rename update the file: ${appAsarPath}`, {
            cause: e,
          }),
        )
        await promisify(rename)(appAsarPath + '.bk', appAsarPath)
      }
    }
  }

  private async externallyUpdatedAppImage(): Promise<boolean> {
    if (this.app.env !== 'appimage') return false
    const settings = await this.app.registry.get(kSettings)
    return isExternallyUpdatedAppImage(this.app.env, settings.appImageUpdateMode)
  }

  async checkUpdateTask(): Promise<ReleaseInfo> {
    // Horizon Client: updates come from the GitHub releases of HORIZON_LAUNCHER_REPO. HORIZON_DISABLE_UPDATES
    // turns them off (for test copies of the launcher).
    if (process.env.HORIZON_DISABLE_UPDATES) {
      return {
        name: `v${this.app.version}`,
        body: '',
        date: new Date().toISOString(),
        files: [],
        newUpdate: false,
        operation: ElectronUpdateOperation.Manual,
      }
    }
    // External or unstable-path AppImages only discover release metadata:
    // checkForUpdates can start a download and register install-on-quit hooks.
    // Horizon Client: the installed Windows build updates itself through electron-updater (latest.yml);
    // the portable exe and macOS get a download page.
    if (await this.externallyUpdatedAppImage() || this.app.platform.os === 'osx' || (this.app.platform.os === 'windows' && isPortable())) {
      return this.#getUpdateFromGitHub()
    }
    try {
      return await this.#getUpdateFromAutoUpdater()
    } catch (e) {
      // No app-update.yml: an unpacked or dev build.
      if (isSystemError(e) && e.code === 'ENOENT') {
        return this.#getUpdateFromGitHub()
      }
      this.logger.warn(e as Error)
      throw e
    }
  }

  async downloadUpdate(updateInfo: ReleaseInfo, options?: DownloadUpdateOptions): Promise<void> {
    // Also guard stale/persisted AutoUpdater or Asar release information.
    if (await this.externallyUpdatedAppImage()
      || (this.app.env === 'appimage' && updateInfo.operation !== ElectronUpdateOperation.AutoUpdater)) {
      await hintUserDownload()
      return
    }
    const tracker = options?.tracker
    const abortSignal = options?.abortSignal

    if (updateInfo.operation === ElectronUpdateOperation.AutoUpdater) {
      await downloadFullUpdate(this.app, updater.autoUpdater, {
        tracker,
        abortSignal,
      })
    } else if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      const updatePath = join(this.app.appDataPath, 'pending_update')
      await downloadAsarUpdate(this.app, updatePath, updateInfo.name, {
        tracker,
        abortSignal,
      })
    } else if (updateInfo.operation === ElectronUpdateOperation.Appx) {
      await downloadAppInstaller(this.app, { tracker, abortSignal })
    } else {
      tracker?.({
        phase: 'download-update.manual',
        payload: {},
      })
      await hintUserDownload()
    }
  }

  async installUpdateAndQuit(updateInfo: ReleaseInfo): Promise<void> {
    if (await this.externallyUpdatedAppImage()
      || (this.app.env === 'appimage' && updateInfo.operation !== ElectronUpdateOperation.AutoUpdater)) {
      // Never invoke quitAndInstall, even with cached release metadata.
      await hintUserDownload()
      return
    }
    if (HAS_DEV_SERVER) {
      this.logger.log('Currently is development environment. Skip to install update')
      return
    }
    if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      await this.quitAndInstallAsar()
    } else if (this.app.platform.os === 'windows') {
      // Horizon Client: install without the installer's pages, then start the new version.
      updater.autoUpdater.quitAndInstall(true, true)
    } else {
      updater.autoUpdater.quitAndInstall()
    }
  }
}
