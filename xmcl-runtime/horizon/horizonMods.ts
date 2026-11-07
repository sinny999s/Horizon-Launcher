/**
 * Horizon Client: puts the Horizon mod, and the two libraries it needs, into a new instance's `mods/`.
 *
 * - Horizon: from the release manifest at `HORIZON_RELEASE_MANIFEST_URL` when one is set, else the jar
 *   bundled with the launcher (`resources/horizon-mod/horizon-<minecraft>-<version>.jar`).
 * - Fabric API and Fabric Language Kotlin: the newest Modrinth release for the instance's Minecraft
 *   version (Horizon's fabric.mod.json depends on both).
 *
 * Nothing here throws: a failed download is logged and the instance is still created.
 */
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { copyFile, ensureDir, readdir, writeFile } from 'fs-extra'
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

async function download(app: LauncherApp, url: string, expectedSha1?: string): Promise<Buffer> {
  const res = await app.fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (expectedSha1 && sha1(buf) !== expectedSha1.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${url}`)
  }
  return buf
}

async function installHorizon(app: LauncherApp, logger: Logger, modsDir: string, minecraft: string) {
  const manifestUrl = process.env.HORIZON_RELEASE_MANIFEST_URL || HORIZON_RELEASE_MANIFEST_URL
  if (manifestUrl) {
    try {
      const res = await app.fetch(manifestUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const manifest = await res.json() as { mods?: HorizonRelease[] }
      const release = manifest.mods?.find(m => m.minecraft === minecraft)
      if (release) {
        const buf = await download(app, release.url, release.sha1)
        const name = decodeURIComponent(release.url.split('/').pop() || `horizon-${minecraft}-${release.version ?? 'latest'}.jar`)
        await writeFile(join(modsDir, name), buf)
        logger.log(`[Horizon] Downloaded ${name} from the release manifest`)
        return
      }
      logger.warn(`[Horizon] The release manifest has no Horizon for Minecraft ${minecraft}; trying the bundled jar`)
    } catch (e) {
      logger.warn(`[Horizon] Release manifest ${manifestUrl} failed; trying the bundled jar`, e)
    }
  }

  const jar = await findBundledHorizonJar(minecraft)
  if (!jar) {
    logger.warn(`[Horizon] No Horizon jar for Minecraft ${minecraft} (looked in ${horizonModDirectories().join(', ')})`)
    return
  }
  const name = jar.split(/[\\/]/).pop()!
  await copyFile(jar, join(modsDir, name))
  logger.log(`[Horizon] Copied bundled ${name}`)
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
