/**
 * Horizon Client: puts the Horizon mod, and the two libraries it needs, into a new instance's `mods/`.
 *
 * - Horizon: the newest of a Horizon build folder (see horizonBuildDirectories), the release manifest at
 *   `HORIZON_RELEASE_MANIFEST_URL` and the jar bundled with the launcher
 *   (`resources/horizon-mod/horizon-<minecraft>-<version>.jar`).
 * - Fabric API and Fabric Language Kotlin: the newest Modrinth release for the instance's Minecraft
 *   version (Horizon's fabric.mod.json depends on both).
 *
 * Nothing here throws: a failed download is logged and the instance is still created.
 */
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { copyFile, ensureDir, readdir, readFile, readJson, rename, stat, unlink, writeFile } from 'fs-extra'
import { homedir } from 'os'
import { join } from 'path'
import type { LauncherApp } from '~/app'

/**
 * Where Horizon releases are listed. Empty means "use the bundled jar".
 *
 * To ship Horizon updates without a new launcher, publish a JSON file like
 *   { "mods": [{ "minecraft": "26.3", "version": "2.0.5", "url": "https://.../horizon-26.3-2.0.5.jar", "sha1": "..." }] }
 * and put its URL here (or set the HORIZON_RELEASE_MANIFEST_URL environment variable).
 */
export const HORIZON_RELEASE_MANIFEST_URL = ''

/**
 * GitHub repository whose latest release carries the Horizon jar as an asset (`horizon-<mc>-<version>.jar`),
 * checked before every launch so players without a build folder still get new versions.
 * `HORIZON_GITHUB_REPO` overrides it; set it to an empty string to turn the check off.
 */
export const HORIZON_GITHUB_REPO = 'sinny999s/Horizon-2.1'

/** Modrinth projects Horizon depends on. */
const DEPENDENCIES = [
  { slug: 'fabric-api', name: 'Fabric API' },
  { slug: 'fabric-language-kotlin', name: 'Fabric Language Kotlin' },
]

interface Logger {
  log(...args: any[]): void
  warn(...args: any[]): void
}

interface HorizonRelease {
  minecraft: string
  version?: string
  url: string
  sha1?: string
}

/** Folders that may hold the bundled jar: an override, the packaged resources, the dev checkout. */
export function horizonModDirectories(): string[] {
  const dirs: string[] = []
  if (process.env.HORIZON_MOD_DIR) dirs.push(process.env.HORIZON_MOD_DIR)
  if ((process as any).resourcesPath) dirs.push(join((process as any).resourcesPath, 'horizon-mod'))
  // Dev: the bundle runs from xmcl-electron-app/dist.
  dirs.push(join(__dirname, '..', 'horizon-mod'))
  return dirs
}

/** The bundled Horizon jar for this Minecraft version, e.g. horizon-26.3-2.0.5.jar. */
export async function findBundledHorizonJar(minecraft: string): Promise<string | undefined> {
  for (const dir of horizonModDirectories()) {
    if (!existsSync(dir)) continue
    const files = (await readdir(dir)).filter(f => f.startsWith(`horizon-${minecraft}-`) && f.endsWith('.jar'))
    if (files.length > 0) {
      // Newest version last when sorted naturally.
      files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      return join(dir, files[files.length - 1])
    }
  }
  return undefined
}

function sha1(buf: Buffer) {
  return createHash('sha1').update(buf).digest('hex')
}

async function download(app: LauncherApp, url: string, expectedSha1?: string, expectedSha256?: string): Promise<Buffer> {
  const res = await app.fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (expectedSha1 && sha1(buf) !== expectedSha1.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${url}`)
  }
  if (expectedSha256 && createHash('sha256').update(buf).digest('hex') !== expectedSha256.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${url}`)
  }
  return buf
}

async function installHorizon(app: LauncherApp, logger: Logger, modsDir: string, minecraft: string) {
  // The same choice as before a launch: a build folder, the release manifest or the bundled jar, newest first.
  const candidates = await findCandidates(app, logger, minecraft)
  candidates.sort((a, b) => compareHorizonVersions(b.version, a.version) || Number(b.isBuild) - Number(a.isBuild))
  const best = candidates[0]
  if (!best) {
    logger.warn(`[Horizon] No Horizon jar for Minecraft ${minecraft} (looked in ${horizonModDirectories().join(', ')})`)
    return
  }
  if (best.source.startsWith('http')) {
    await writeFile(join(modsDir, best.name), await download(app, best.source, best.sha1, best.sha256))
  } else {
    await copyFile(best.source, join(modsDir, best.name))
  }
  logger.log(`[Horizon] Added ${best.name} (${best.isBuild ? 'build folder' : best.source.startsWith('http') ? 'release' : 'bundled'})`)
}

async function installDependency(app: LauncherApp, logger: Logger, modsDir: string, minecraft: string, slug: string, name: string) {
  const query = new URLSearchParams({
    loaders: JSON.stringify(['fabric']),
    game_versions: JSON.stringify([minecraft]),
  })
  const res = await app.fetch(`https://api.modrinth.com/v2/project/${slug}/version?${query}`)
  if (!res.ok) throw new Error(`Modrinth HTTP ${res.status} for ${slug}`)
  const versions = await res.json() as Array<{
    version_type: string
    files: Array<{ url: string, filename: string, primary: boolean, hashes: { sha1: string } }>
  }>
  const version = versions.find(v => v.version_type === 'release') ?? versions[0]
  const file = version?.files.find(f => f.primary) ?? version?.files[0]
  if (!file) {
    logger.warn(`[Horizon] ${name} has no Fabric build for Minecraft ${minecraft} on Modrinth`)
    return
  }
  const buf = await download(app, file.url, file.hashes.sha1)
  await writeFile(join(modsDir, file.filename), buf)
  logger.log(`[Horizon] Downloaded ${file.filename}`)
}

/** Fills `<instancePath>/mods` with Horizon, Fabric API and Fabric Language Kotlin. */
export async function installHorizonMods(app: LauncherApp, logger: Logger, instancePath: string, minecraft: string) {
  const modsDir = join(instancePath, 'mods')
  await ensureDir(modsDir)
  const existing = new Set(await readdir(modsDir).catch(() => [] as string[]))
  const has = (prefix: string) => [...existing].some(f => f.toLowerCase().startsWith(prefix))

  const tasks: Promise<void>[] = []
  if (!has('horizon-')) {
    tasks.push(installHorizon(app, logger, modsDir, minecraft).catch(e => logger.warn('[Horizon] Failed to add Horizon', e)))
  }
  for (const dep of DEPENDENCIES) {
    if (has(dep.slug)) continue
    tasks.push(installDependency(app, logger, modsDir, minecraft, dep.slug, dep.name)
      .catch(e => logger.warn(`[Horizon] Failed to download ${dep.name}`, e)))
  }
  await Promise.all(tasks)
}

// ── Keeping Horizon up to date ──────────────────────────────────────────────────────────────────────────────

/** `horizon-26.3-2.0.5.jar` → { minecraft: '26.3', version: '2.0.5' }. */
export function parseHorizonJarName(name: string): { minecraft: string; version: string } | undefined {
  const m = /^horizon-(\d+\.\d+(?:\.\d+)?)-(.+)\.jar$/i.exec(name)
  return m ? { minecraft: m[1], version: m[2] } : undefined
}

/** Compares "2.0.10" and "2.0.9" as versions (numbers numerically). */
export function compareHorizonVersions(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Folders holding fresh Horizon builds, checked before every launch: `HORIZON_BUILD_DIR`, the `buildDir` in
 * `<launcher data>/horizon.json`, and the mod's own build folder when the checkout sits in Downloads
 * (`~/Downloads/horizon-main/kotlin-client/build/libs`, where `./gradlew build` puts the jar).
 */
export async function horizonBuildDirectories(app: LauncherApp): Promise<string[]> {
  const dirs: string[] = []
  if (process.env.HORIZON_BUILD_DIR) dirs.push(process.env.HORIZON_BUILD_DIR)
  try {
    const config = await readJson(join(app.appDataPath, 'horizon.json'))
    if (typeof config?.buildDir === 'string' && config.buildDir) dirs.push(config.buildDir)
  } catch { }
  dirs.push(join(homedir(), 'Downloads', 'horizon-main', 'kotlin-client', 'build', 'libs'))
  return dirs.filter(d => existsSync(d))
}

interface HorizonCandidate {
  /** A local file, or a URL from the release manifest. */
  source: string
  name: string
  version: string
  /** From a build folder: a rebuilt jar with the same version still counts as newer. */
  isBuild: boolean
  sha1?: string
  sha256?: string
}

async function findCandidates(app: LauncherApp, logger: Logger, minecraft: string): Promise<HorizonCandidate[]> {
  const found: HorizonCandidate[] = []
  for (const dir of await horizonBuildDirectories(app)) {
    // The newest build: highest version, then the latest written.
    const jars = [] as { name: string; version: string; mtime: number }[]
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const parsed = parseHorizonJarName(name)
      if (parsed?.minecraft !== minecraft) continue
      jars.push({ name, version: parsed.version, mtime: (await stat(join(dir, name))).mtimeMs })
    }
    jars.sort((a, b) => compareHorizonVersions(b.version, a.version) || b.mtime - a.mtime)
    if (jars[0]) found.push({ source: join(dir, jars[0].name), name: jars[0].name, version: jars[0].version, isBuild: true })
  }
  const manifestUrl = process.env.HORIZON_RELEASE_MANIFEST_URL || HORIZON_RELEASE_MANIFEST_URL
  if (manifestUrl) {
    try {
      const res = await app.fetch(manifestUrl, { signal: AbortSignal.timeout(4000) })
      const manifest = await res.json() as { mods?: HorizonRelease[] }
      const release = manifest.mods?.find(m => m.minecraft === minecraft)
      if (release?.version) {
        const name = decodeURIComponent(release.url.split('/').pop() || `horizon-${minecraft}-${release.version}.jar`)
        found.push({ source: release.url, name, version: release.version, isBuild: false, sha1: release.sha1 })
      }
    } catch (e) {
      logger.warn('[Horizon] Release manifest unreachable; skipping it this launch', e)
    }
  }
  const repo = process.env.HORIZON_GITHUB_REPO ?? HORIZON_GITHUB_REPO
  if (repo) {
    try {
      const res = await app.fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const release = await res.json() as { assets?: Array<{ name: string; browser_download_url: string; digest?: string }> }
      for (const asset of release.assets ?? []) {
        const parsed = parseHorizonJarName(asset.name)
        if (parsed?.minecraft !== minecraft) continue
        const sha256 = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : undefined
        found.push({ source: asset.browser_download_url, name: asset.name, version: parsed.version, isBuild: false, sha256 })
      }
    } catch (e) {
      logger.warn(`[Horizon] GitHub releases of ${repo} unreachable; skipping them this launch`, e)
    }
  }
  const bundled = await findBundledHorizonJar(minecraft)
  if (bundled) {
    const name = bundled.split(/[\\/]/).pop()!
    const parsed = parseHorizonJarName(name)
    if (parsed) found.push({ source: bundled, name, version: parsed.version, isBuild: false })
  }
  return found
}

/**
 * Before a launch: if the instance has Horizon turned on, replace its jar with the newest one available (a build
 * folder, the release manifest or the jar bundled with the launcher). An instance without Horizon, or with it
 * turned off, is left alone. Never throws: on any problem the instance launches with the jar it has.
 *
 * @returns the jar name that is now installed, when it changed.
 */
export async function updateHorizonMod(app: LauncherApp, logger: Logger, instancePath: string): Promise<string | undefined> {
  const modsDir = join(instancePath, 'mods')
  try {
    const installed = (await readdir(modsDir).catch(() => [] as string[]))
      .map(name => ({ name, parsed: parseHorizonJarName(name) }))
      .filter((f): f is { name: string; parsed: { minecraft: string; version: string } } => !!f.parsed)
    if (installed.length === 0) return undefined
    // Several enabled Horizon jars would crash Fabric with a duplicate mod: the newest one decides.
    installed.sort((a, b) => compareHorizonVersions(b.parsed.version, a.parsed.version))
    const current = installed[0]
    const candidates = await findCandidates(app, logger, current.parsed.minecraft)
    // Highest version wins; on a tie a fresh build beats a release or the bundled jar.
    candidates.sort((a, b) => compareHorizonVersions(b.version, a.version) || Number(b.isBuild) - Number(a.isBuild))
    const best = candidates[0]
    if (!best) return undefined

    const order = compareHorizonVersions(best.version, current.parsed.version)
    let data: Buffer | undefined
    if (order < 0) return undefined
    if (order === 0) {
      if (!best.isBuild) return undefined
      // Same version number: only a rebuilt jar (different bytes) replaces it.
      data = await readFile(best.source)
      const installedData = await readFile(join(modsDir, current.name))
      if (sha1(data) === sha1(installedData)) return undefined
    }
    if (!data) {
      data = best.source.startsWith('http') ? await download(app, best.source, best.sha1, best.sha256) : await readFile(best.source)
    }

    const tmp = join(modsDir, `${best.name}.horizon-update`)
    await writeFile(tmp, data)
    for (const old of installed) {
      await unlink(join(modsDir, old.name))
    }
    await rename(tmp, join(modsDir, best.name))
    logger.log(`[Horizon] Updated ${current.name} -> ${best.name} (${best.isBuild ? 'build folder' : best.source.startsWith('http') ? 'release' : 'bundled'})`)
    return best.name
  } catch (e) {
    // Usually a jar in use by a running game: launch with what's there.
    logger.warn('[Horizon] Could not update the Horizon jar; launching with the installed one', e)
    try { for (const f of await readdir(modsDir)) if (f.endsWith('.horizon-update')) await unlink(join(modsDir, f)) } catch { }
    return undefined
  }
}
