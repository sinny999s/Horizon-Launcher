import { describe, expect, test } from 'vitest'
import { filterHorizonMinecraftVersions, isHorizonMinecraftVersion } from './horizon'

const v = (id: string, type = 'release') => ({ id, type, url: '', time: '', releaseTime: '' })

describe('Horizon Client version rules', () => {
  test('releases from 26.3 on only', () => {
    expect(isHorizonMinecraftVersion('26.3')).toBe(true)
    expect(isHorizonMinecraftVersion('26.3.1')).toBe(true)
    expect(isHorizonMinecraftVersion('26.4')).toBe(true)
    expect(isHorizonMinecraftVersion('27.1')).toBe(true)
    expect(isHorizonMinecraftVersion('26.2')).toBe(false)
    expect(isHorizonMinecraftVersion('26.1.2')).toBe(false)
    expect(isHorizonMinecraftVersion('1.21.4')).toBe(false)
    expect(isHorizonMinecraftVersion('26.4-snapshot-7')).toBe(false)
    expect(isHorizonMinecraftVersion('')).toBe(false)
  })

  test('filters the Mojang list by Fabric support and picks the newest release', () => {
    const data = {
      latest: { release: '26.4', snapshot: '26.5-snapshot-1' },
      versions: [v('26.5-snapshot-1', 'snapshot'), v('26.4'), v('26.3.1'), v('26.3'), v('26.2'), v('1.21.4'), v('b1.7.3', 'old_beta')],
    }
    // Fabric doesn't support 26.4 yet: it stays hidden.
    const filtered = filterHorizonMinecraftVersions(data as any, ['26.5-snapshot-1', '26.3.1', '26.3', '26.2', '1.21.4'])
    expect(filtered.versions.map(x => x.id)).toEqual(['26.3.1', '26.3'])
    expect(filtered.latest).toEqual({ release: '26.3.1', snapshot: '26.3.1' })

    // Once Fabric lists it, 26.4 shows up and becomes the default.
    const later = filterHorizonMinecraftVersions(data as any, ['26.4', '26.3.1', '26.3'])
    expect(later.versions.map(x => x.id)).toEqual(['26.4', '26.3.1', '26.3'])
    expect(later.latest.release).toBe('26.4')

    // Fabric's list unknown (offline): every release from 26.3 on.
    expect(filterHorizonMinecraftVersions(data as any).versions.map(x => x.id)).toEqual(['26.4', '26.3.1', '26.3'])
  })
})
