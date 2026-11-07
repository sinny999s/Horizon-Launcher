/**
 * Horizon Client: what the launcher lets you install.
 *
 * Only Minecraft releases from 26.3 on, and only with Fabric (the Horizon mod is a Fabric mod). A newer
 * release appears on its own once Mojang lists it and Fabric's meta lists it as supported.
 */
import type { MinecraftVersions } from './entities/version'

/** The oldest Minecraft release Horizon Client offers. */
export const HORIZON_MIN_MINECRAFT = '26.3'

/** The only mod loader Horizon Client offers. */
export const HORIZON_LOADER = 'fabric'

/** Parses a release id ("26.3", "26.3.1", "1.21.4") into numbers. Snapshots and pre-releases give undefined. */
export function parseReleaseVersion(id: string): number[] | undefined {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(id)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : undefined
}

export function compareReleaseVersions(a: number[], b: number[]) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** True for a release id at or above 26.3. */
export function isHorizonMinecraftVersion(id: string | undefined): boolean {
  if (!id) return false
  const v = parseReleaseVersion(id)
  if (!v) return false
  return compareReleaseVersions(v, parseReleaseVersion(HORIZON_MIN_MINECRAFT)!) >= 0
}

/**
 * Keeps the releases from 26.3 on that Fabric supports (when Fabric's game list is known), and points
 * `latest.release`/`latest.snapshot` at the newest of them.
 */
export function filterHorizonMinecraftVersions(data: MinecraftVersions, fabricGameVersions?: string[]): MinecraftVersions {
  const fabric = fabricGameVersions && fabricGameVersions.length > 0 ? new Set(fabricGameVersions) : undefined
  const versions = data.versions.filter(v => v.type === 'release' && isHorizonMinecraftVersion(v.id) && (!fabric || fabric.has(v.id)))
  const newest = versions
    .map(v => v.id)
    .reduce((a, b) => compareReleaseVersions(parseReleaseVersion(a)!, parseReleaseVersion(b)!) >= 0 ? a : b, HORIZON_MIN_MINECRAFT)
  return { ...data, versions, latest: { release: newest, snapshot: newest } }
}
