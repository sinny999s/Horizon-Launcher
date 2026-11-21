import { describe, expect, test } from 'vitest'
import { gameAccountsEnv, handleGameAccountsRequest, isLoopbackAddress, listGameAccounts, setGameAccountsBridge, type GameAccountsDeps, type GameAccountsRequest } from './gameAccounts'

const KEY = 'k'.repeat(43)

function user(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    username: `${name}@example.com`,
    invalidated: false,
    authority: 'x://microsoft',
    expiredAt: 1_800_000_000_000,
    selectedProfile: `${name}-uuid`,
    profiles: {
      [`${name}-uuid`]: { id: `${name}-uuid`, name, textures: { SKIN: { url: `http://textures.minecraft.net/texture/${name}` } } },
    },
    ...extra,
  } as any
}

function deps(over: Partial<GameAccountsDeps> = {}, users: Record<string, any> = { a: user('a', 'softtop'), b: user('b', 'patrolcar') }) {
  const calls: string[] = []
  const d: GameAccountsDeps = {
    key: KEY,
    launcher: 'Horizon Client test',
    users: () => users,
    refresh: async (id) => { calls.push(`refresh ${id}`) },
    token: async (u) => { calls.push(`token ${u.id}`); return `token-of-${u.id}` },
    ...over,
  }
  return { d, calls, users }
}

function request(over: Partial<GameAccountsRequest> = {}): GameAccountsRequest {
  return {
    method: 'GET',
    path: '/horizon/accounts',
    authorization: `Bearer ${KEY}`,
    remoteAddress: '127.0.0.1',
    body: async () => '',
    ...over,
  }
}

const token = (id: unknown, over: Partial<GameAccountsRequest> = {}) =>
  request({ method: 'POST', path: '/horizon/accounts/token', body: async () => JSON.stringify({ id }), ...over })

describe('the accounts a game is shown', () => {
  test('Microsoft accounts with a profile, without emails or tokens', () => {
    const list = listGameAccounts({
      a: user('a', 'softtop'),
      offline: user('offline', 'Steve', { authority: 'x://dev' }),
      noGame: user('noGame', 'x', { profiles: {}, selectedProfile: '' }),
      b: user('b', 'patrolcar', { invalidated: true }),
    })
    expect(list).toEqual([
      { id: 'a', uuid: 'softtop-uuid', name: 'softtop', skin: 'http://textures.minecraft.net/texture/softtop', signedOut: false },
      // Invalidated alone (a rate-limited startup refresh) is not "signed out".
      { id: 'b', uuid: 'patrolcar-uuid', name: 'patrolcar', skin: 'http://textures.minecraft.net/texture/patrolcar', signedOut: false },
    ])
    expect(JSON.stringify(list)).not.toContain('example.com')
  })

  test('signed out once a quiet sign-in was turned down, while it stays invalidated', () => {
    const users = { b: user('b', 'patrolcar', { invalidated: true }) }
    expect(listGameAccounts(users, new Set(['b']))[0].signedOut).toBe(true)
    users.b.invalidated = false
    expect(listGameAccounts(users, new Set(['b']))[0].signedOut).toBe(false)
  })
})

describe('who may ask', () => {
  test('loopback addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('192.168.1.20')).toBe(false)
    expect(isLoopbackAddress('::ffff:192.168.1.20')).toBe(false)
    expect(isLoopbackAddress(undefined)).toBe(false)
  })

  test('other paths are not the bridge\'s', async () => {
    const { d } = deps()
    expect(await handleGameAccountsRequest(request({ path: '/auth' }), d)).toBeUndefined()
    expect(await handleGameAccountsRequest(request({ path: '/horizon/accounts/other' }), d)).toBeUndefined()
  })

  test('nothing without the key, from another computer, or not over the server', async () => {
    const { d, calls } = deps()
    for (const bad of [
      request({ authorization: undefined }),
      request({ authorization: 'Bearer wrong' }),
      request({ authorization: KEY }),
      request({ authorization: `Bearer ${KEY}x` }),
      request({ remoteAddress: '192.168.1.20' }),
      request({ remoteAddress: undefined }),
      token('a', { authorization: 'Bearer nope' }),
      token('a', { remoteAddress: '10.0.0.5' }),
    ]) {
      const res = await handleGameAccountsRequest(bad, d)
      expect(res?.status).toBe(403)
      expect(JSON.stringify(res?.body)).not.toContain('token-of')
    }
    // Nothing was refreshed or read for them.
    expect(calls).toEqual([])
  })
})

describe('listing', () => {
  test('GET lists', async () => {
    const { d, calls } = deps()
    const res = await handleGameAccountsRequest(request(), d)
    expect(res?.status).toBe(200)
    expect((res?.body.accounts as any[]).map(a => a.name)).toEqual(['softtop', 'patrolcar'])
    expect(res?.body.launcher).toBe('Horizon Client test')
    expect(calls).toEqual([])
    expect((await handleGameAccountsRequest(request({ method: 'POST' }), d))?.status).toBe(405)
  })
})

describe('a token for an account', () => {
  test('refreshes quietly, then hands the token over', async () => {
    const { d, calls } = deps()
    const res = await handleGameAccountsRequest(token('a'), d)
    expect(res).toEqual({ status: 200, body: { uuid: 'softtop-uuid', name: 'softtop', accessToken: 'token-of-a', expiresAt: 1_800_000_000_000 } })
    expect(calls).toEqual(['refresh a', 'token a'])
  })

  test('the profile after the refresh is the one answered with', async () => {
    const users: Record<string, any> = { a: user('a', 'oldname') }
    const { d } = deps({ refresh: async () => { users.a = user('a', 'newname') } }, users)
    expect((await handleGameAccountsRequest(token('a'), d))?.body.name).toBe('newname')
  })

  test('unknown accounts, other account systems and bad requests', async () => {
    const { d, calls } = deps({}, { a: user('a', 'softtop'), off: user('off', 'Steve', { authority: 'x://dev' }) })
    expect((await handleGameAccountsRequest(token('nope'), d))?.status).toBe(404)
    expect((await handleGameAccountsRequest(token('off'), d))?.status).toBe(404)
    expect((await handleGameAccountsRequest(token(undefined), d))?.status).toBe(404)
    expect((await handleGameAccountsRequest(token('a', { body: async () => 'not json' }), d))?.status).toBe(400)
    expect((await handleGameAccountsRequest(token('a', { method: 'GET' }), d))?.status).toBe(405)
    expect(calls).toEqual([])
  })

  test('why a refresh failed', async () => {
    const failing = (reason?: string) => deps({
      refresh: async () => { throw Object.assign(new Error('x'), { exception: { type: 'userAccessTokenExpired', reason } }) },
    })
    const signedOut = new Set<string>()

    const busy = await handleGameAccountsRequest(token('a'), failing('RATE_LIMITED').d, signedOut)
    expect(busy?.status).toBe(429)
    expect(busy?.body.error).toBe('rate_limited')

    const offline = await handleGameAccountsRequest(token('a'), failing('NETWORK_ERROR').d, signedOut)
    expect(offline?.status).toBe(503)
    expect(offline?.body.error).toBe('offline')

    const unknown = await handleGameAccountsRequest(token('a'), failing(undefined).d, signedOut)
    expect(unknown?.status).toBe(502)
    expect(unknown?.body.error).toBe('failed')
    // None of those means the account is signed out.
    expect(signedOut.size).toBe(0)

    const { d, calls } = failing('SIGN_IN_REQUIRED')
    const gone = await handleGameAccountsRequest(token('a'), d, signedOut)
    expect(gone?.status).toBe(401)
    expect(gone?.body).toEqual({ error: 'sign_in_required', message: 'Sign in to softtop again in the Horizon launcher' })
    expect(signedOut.has('a')).toBe(true)
    // No token is read after a failed refresh.
    expect(calls).toEqual([])
  })

  test('a later good refresh clears "signed out"', async () => {
    const signedOut = new Set(['a'])
    const { d } = deps()
    expect((await handleGameAccountsRequest(token('a'), d, signedOut))?.status).toBe(200)
    expect(signedOut.has('a')).toBe(false)
  })

  test('no saved token is a sign-in', async () => {
    const { d } = deps({ token: async () => undefined })
    const res = await handleGameAccountsRequest(token('a'), d)
    expect(res?.status).toBe(401)
    expect(res?.body.error).toBe('sign_in_required')
  })
})

describe('what a game is started with', () => {
  test('nothing until the bridge is up, then its address and key', async () => {
    expect(await gameAccountsEnv()).toEqual({})
    // The launcher's server starts listening after the plugins are set up: the port is asked for at launch time.
    let port: Promise<number> | undefined
    setGameAccountsBridge(KEY, () => port)
    expect(await gameAccountsEnv()).toEqual({})
    port = Promise.resolve(25562)
    expect(await gameAccountsEnv()).toEqual({
      HORIZON_LAUNCHER_BRIDGE: 'http://127.0.0.1:25562/horizon/accounts',
      HORIZON_LAUNCHER_BRIDGE_KEY: KEY,
    })
    port = Promise.reject(new Error('could not listen'))
    expect(await gameAccountsEnv()).toEqual({})
  })
})
