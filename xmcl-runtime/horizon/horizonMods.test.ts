import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { compareHorizonVersions, parseHorizonJarName, updateHorizonMod } from './horizonMods'

const logger = { log() { }, warn() { } }

describe('Horizon jar names', () => {
  test('parse', () => {
    expect(parseHorizonJarName('horizon-26.3-2.0.5.jar')).toEqual({ minecraft: '26.3', version: '2.0.5' })
    expect(parseHorizonJarName('horizon-26.3.1-2.1.0-beta.jar')).toEqual({ minecraft: '26.3.1', version: '2.1.0-beta' })
    expect(parseHorizonJarName('horizon-26.3-2.0.5.jar.disabled')).toBeUndefined()
    expect(parseHorizonJarName('fabric-api-0.164.0+26.3.jar')).toBeUndefined()
  })
  test('compare', () => {
    expect(compareHorizonVersions('2.0.10', '2.0.9')).toBeGreaterThan(0)
    expect(compareHorizonVersions('2.0.5', '2.0.5')).toBe(0)
    expect(compareHorizonVersions('2.0.4', '2.0.5')).toBeLessThan(0)
  })
})

// Versions are 9.x here so a real Horizon build folder on this machine (~/Downloads/horizon-main/...) never wins.
describe('updateHorizonMod', () => {
  let root: string
  let mods: string
  let builds: string
  const app = { appDataPath: '', fetch } as any

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hz-'))
    mods = join(root, 'instance', 'mods')
    builds = join(root, 'builds')
    mkdirSync(mods, { recursive: true })
    mkdirSync(builds, { recursive: true })
    app.appDataPath = root
    process.env.HORIZON_BUILD_DIR = builds
    process.env.HORIZON_GITHUB_REPO = ''
    app.fetch = fetch
  })
  afterEach(() => {
    delete process.env.HORIZON_BUILD_DIR
    delete process.env.HORIZON_GITHUB_REPO
  })

  test('a newer GitHub release is downloaded and checked against its digest', async () => {
    const { createHash } = await import('crypto')
    const jar = Buffer.from('released jar')
    process.env.HORIZON_GITHUB_REPO = 'someone/horizon'
    app.fetch = async (url: string) => {
      if (url.includes('/releases/latest')) {
        return new Response(JSON.stringify({ assets: [
          { name: 'horizon-26.3-9.1.0.jar', browser_download_url: 'https://example.com/horizon-26.3-9.1.0.jar', digest: 'sha256:' + createHash('sha256').update(jar).digest('hex') },
          { name: 'horizon-27.1-9.9.9.jar', browser_download_url: 'https://example.com/other.jar' },
        ] }))
      }
      return new Response(jar)
    }
    writeFileSync(join(mods, 'horizon-26.3-9.0.0.jar'), 'old')
    expect(await updateHorizonMod(app, logger, join(root, 'instance'))).toBe('horizon-26.3-9.1.0.jar')
    expect(readFileSync(join(mods, 'horizon-26.3-9.1.0.jar'), 'utf-8')).toBe('released jar')
  })

  test('a newer build replaces the installed jar', async () => {
    writeFileSync(join(mods, 'horizon-26.3-9.0.0.jar'), 'old')
    writeFileSync(join(builds, 'horizon-26.3-9.0.1.jar'), 'new')
    expect(await updateHorizonMod(app, logger, join(root, 'instance'))).toBe('horizon-26.3-9.0.1.jar')
    expect(readdirSync(mods)).toEqual(['horizon-26.3-9.0.1.jar'])
    expect(readFileSync(join(mods, 'horizon-26.3-9.0.1.jar'), 'utf-8')).toBe('new')
  })

  test('a rebuild with the same version replaces it; identical bytes do not', async () => {
    writeFileSync(join(mods, 'horizon-26.3-9.0.0.jar'), 'old')
    writeFileSync(join(builds, 'horizon-26.3-9.0.0.jar'), 'rebuilt')
    expect(await updateHorizonMod(app, logger, join(root, 'instance'))).toBe('horizon-26.3-9.0.0.jar')
    expect(readFileSync(join(mods, 'horizon-26.3-9.0.0.jar'), 'utf-8')).toBe('rebuilt')
    expect(await updateHorizonMod(app, logger, join(root, 'instance'))).toBeUndefined()
  })

  test('an older build, a turned-off jar or no Horizon at all are left alone', async () => {
    writeFileSync(join(mods, 'horizon-26.3-9.0.5.jar'), 'installed')
    writeFileSync(join(builds, 'horizon-26.3-9.0.4.jar'), 'older')
    expect(await updateHorizonMod(app, logger, join(root, 'instance'))).toBeUndefined()

    const off = join(root, 'off', 'mods')
    mkdirSync(off, { recursive: true })
    writeFileSync(join(off, 'horizon-26.3-9.0.0.jar.disabled'), 'off')
    expect(await updateHorizonMod(app, logger, join(root, 'off'))).toBeUndefined()
    expect(readdirSync(off)).toEqual(['horizon-26.3-9.0.0.jar.disabled'])
  })

  test('picks the highest version, then the newest file, in the build folder', async () => {
    writeFileSync(join(mods, 'horizon-26.3-9.0.0.jar'), 'old')
    writeFileSync(join(builds, 'horizon-26.3-9.0.2.jar'), 'a')
    writeFileSync(join(builds, 'horizon-26.3-9.0.10.jar'), 'b')
    writeFileSync(join(builds, 'horizon-27.1-9.9.9.jar'), 'other minecraft')
    const past = new Date(Date.now() - 60_000)
    utimesSync(join(builds, 'horizon-26.3-9.0.2.jar'), past, past)
    expect(await updateHorizonMod(app, logger, join(root, 'instance'))).toBe('horizon-26.3-9.0.10.jar')
    expect(readdirSync(mods)).toEqual(['horizon-26.3-9.0.10.jar'])
  })
})
