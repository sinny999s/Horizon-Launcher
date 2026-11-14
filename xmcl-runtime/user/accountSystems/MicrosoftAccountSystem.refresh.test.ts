import { AUTHORITY_MICROSOFT, UserException, UserProfile, USER_TOKEN_REFRESH_MARGIN, isUserTokenExpiring } from '@xmcl/runtime-api'
import { AnyError } from '@xmcl/utils'
import { MicrosoftMinecraftXboxLoginError } from '@xmcl/user'
import { describe, expect, it, vi } from 'vitest'
import { MicrosoftAccountSystem, getRefreshFailureReason } from './MicrosoftAccountSystem'
import { isNetworkError, isTransientAuthError } from './MicrosoftAuthErrors'
import { findAccount } from './MicrosoftOAuthClient'

const HOUR = 3600_000

function createUser(patch: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'x://user@microsoft',
    username: 'alias-b@example.com',
    invalidated: false,
    authority: AUTHORITY_MICROSOFT,
    expiredAt: Date.now() - HOUR,
    profiles: {},
    selectedProfile: 'p',
    ...patch,
  }
}

function createSystem(loginMicrosoft: (...args: any[]) => Promise<any>) {
  const storage = new Map<string, string>()
  const tokenStorage = {
    put: vi.fn(async (user: UserProfile, token: string) => { storage.set(user.id, token) }),
    get: vi.fn(async (user: UserProfile) => storage.get(user.id)),
  }
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
  const app = { fetch: vi.fn(), platform: { os: 'windows' } } as any
  const system = new MicrosoftAccountSystem(logger, {} as any, {} as any, async () => tokenStorage as any, {} as any, app)
  const login = vi.spyOn(system as any, 'loginMicrosoft').mockImplementation(loginMicrosoft as any)
  return { system, login, tokenStorage, app }
}

const fresh = {
  accessToken: 'new-token',
  expiredAt: Date.now() + 24 * HOUR,
  gameProfiles: [{ id: 'p', name: 'Player', textures: { SKIN: { url: '' } } }],
  selectedProfile: { id: 'p', name: 'Player', textures: { SKIN: { url: '' } } },
  username: 'alias-b@example.com',
  homeAccountId: 'home-1',
}

describe('isUserTokenExpiring', () => {
  it('counts a token within the margin as expiring, but not one valid for longer', () => {
    const now = Date.now()
    expect(isUserTokenExpiring({ expiredAt: now - 1, invalidated: false }, now)).toBe(true)
    expect(isUserTokenExpiring({ expiredAt: now + USER_TOKEN_REFRESH_MARGIN - 1, invalidated: false }, now)).toBe(true)
    expect(isUserTokenExpiring({ expiredAt: now + USER_TOKEN_REFRESH_MARGIN + 60_000, invalidated: false }, now)).toBe(false)
    expect(isUserTokenExpiring({ expiredAt: now + 20 * HOUR, invalidated: true }, now)).toBe(true)
    expect(isUserTokenExpiring({ expiredAt: -1, invalidated: false }, now)).toBe(true)
  })
})

describe('MicrosoftAccountSystem.refresh', () => {
  it('silently refreshes an expired token with the saved home account id and keeps the new id', async () => {
    const { system, login, tokenStorage } = createSystem(async () => fresh)
    const user = createUser({ homeAccountId: 'home-1', invalidated: true })

    await system.refresh(user, new AbortController().signal, { silent: true })

    // username, code, deviceCode, directRedirect, signal, silentOnly, homeAccountId
    expect(login).toHaveBeenCalledWith('alias-b@example.com', undefined, false, true, expect.anything(), true, 'home-1')
    expect(user.invalidated).toBe(false)
    expect(user.expiredAt).toBe(fresh.expiredAt)
    expect(user.homeAccountId).toBe('home-1')
    expect(tokenStorage.put).toHaveBeenCalledWith(user, 'new-token')
  })

  it('refreshes a token that is still valid but expires within the margin', async () => {
    const { system, login } = createSystem(async () => fresh)
    const user = createUser({ expiredAt: Date.now() + 30 * 60_000 })
    await system.refresh(user, new AbortController().signal, { silent: true })
    expect(login).toHaveBeenCalledOnce()
  })

  it('leaves a token valid for hours alone', async () => {
    const { system, login } = createSystem(async () => fresh)
    const user = createUser({ expiredAt: Date.now() + 20 * HOUR })
    await system.refresh(user, new AbortController().signal, { silent: true })
    expect(login).not.toHaveBeenCalled()
  })

  it('marks the profile invalidated and asks for a sign-in when the silent token is rejected', async () => {
    const silentMiss = new UserException({ type: 'userAcquireMicrosoftTokenFailed' }, 'Failed to acquire Microsoft access token', {
      cause: new AnyError('MicrosoftOAuthSlientFailed', 'Fail to acquire Microsoft token silently.'),
    })
    const { system, tokenStorage } = createSystem(async () => { throw silentMiss })
    const user = createUser()

    const error = await system.refresh(user, new AbortController().signal, { silent: true }).catch(e => e)

    expect(error).toBeInstanceOf(UserException)
    expect(error.exception).toEqual({ type: 'userAccessTokenExpired', reason: 'SIGN_IN_REQUIRED' })
    expect(user.invalidated).toBe(true)
    // The old token stays: a later refresh or sign-in replaces it.
    expect(tokenStorage.put).not.toHaveBeenCalled()
  })

  it('reports a 429 from the Minecraft login as rate limited, not as a sign-in', async () => {
    const rateLimited = new UserException({ type: 'userLoginMinecraftByXboxFailed', status: 429, retryable: true }, 'HTTP 429', {
      cause: new MicrosoftMinecraftXboxLoginError(429, '{}', undefined, true),
    })
    const { system } = createSystem(async () => { throw rateLimited })
    const error = await system.refresh(createUser(), new AbortController().signal, { silent: true }).catch(e => e)
    expect(error.exception).toEqual({ type: 'userAccessTokenExpired', reason: 'RATE_LIMITED' })
  })
})

describe('getRefreshFailureReason', () => {
  const acquireFailed = (cause: unknown, reason?: 'USER_CANCELED' | 'NETWORK_ERROR') =>
    new UserException({ type: 'userAcquireMicrosoftTokenFailed', reason }, 'Failed', { cause })

  it('asks for a sign-in when Microsoft needs interaction', () => {
    expect(getRefreshFailureReason(acquireFailed(new AnyError('MicrosoftOAuthSlientFailed', '')))).toBe('SIGN_IN_REQUIRED')
    expect(getRefreshFailureReason(acquireFailed(Object.assign(new Error('interaction_required: x'), { errorCode: 'interaction_required' })))).toBe('SIGN_IN_REQUIRED')
    expect(getRefreshFailureReason(acquireFailed(Object.assign(new Error('AADSTS70000'), { errorCode: 'invalid_grant' })))).toBe('SIGN_IN_REQUIRED')
    expect(getRefreshFailureReason(acquireFailed(new Error('user_canceled'), 'USER_CANCELED'))).toBe('SIGN_IN_REQUIRED')
  })

  it('does not ask for a sign-in when offline or rate limited', () => {
    expect(getRefreshFailureReason(acquireFailed(new Error('network_error'), 'NETWORK_ERROR'))).toBe('NETWORK_ERROR')
    expect(getRefreshFailureReason(new UserException({ type: 'userLoginMinecraftByXboxFailed', status: 429 }))).toBe('RATE_LIMITED')
    expect(getRefreshFailureReason(new UserException({ type: 'userLoginMinecraftByXboxFailed', status: 500 }))).toBeUndefined()
    expect(getRefreshFailureReason(new UserException({ type: 'userExchangeXboxTokenFailed', reason: 'BANNED' }))).toBeUndefined()
    expect(getRefreshFailureReason(acquireFailed(Object.assign(new Error('Aborted'), { name: 'AbortError' })))).toBeUndefined()
  })
})

describe('isTransientAuthError', () => {
  it('treats being offline and a server outage as transient', () => {
    expect(isNetworkError({ errorCode: 'no_network_connectivity' })).toBe(true)
    expect(isTransientAuthError({ errorCode: 'no_network_connectivity' })).toBe(true)
    expect(isTransientAuthError({ errorCode: 'server_unavailable' })).toBe(true)
    expect(isTransientAuthError({ errorCode: 'interaction_required' })).toBe(false)
  })
})

describe('findAccount', () => {
  const account = (username: string, homeAccountId: string) => ({ username, homeAccountId, environment: 'login.microsoftonline.com', tenantId: 't', localAccountId: homeAccountId })

  it('finds the account by its home account id even when the broker lists another alias', () => {
    const accounts = [account('other@example.com', 'home-2'), account('alias-a@example.com', 'home-1')]
    expect(findAccount(accounts, 'alias-b@example.com', 'home-1')?.homeAccountId).toBe('home-1')
  })

  it('falls back to the username, ignoring case', () => {
    const accounts = [account('Alias-B@Example.com', 'home-1')]
    expect(findAccount(accounts, 'alias-b@example.com')?.homeAccountId).toBe('home-1')
    expect(findAccount(accounts, 'alias-b@example.com', 'gone')?.homeAccountId).toBe('home-1')
    expect(findAccount(accounts, 'nobody@example.com')).toBeUndefined()
  })
})

describe('MicrosoftOAuthClient silent refresh', () => {
  const account = { username: 'alias-a@example.com', homeAccountId: 'home-1', environment: 'login.microsoftonline.com', tenantId: 't', localAccountId: 'home-1' }

  async function createClient(acquireTokenSilent: (...args: any[]) => Promise<any>) {
    const { MicrosoftOAuthClient } = await import('./MicrosoftOAuthClient')
    const client = new MicrosoftOAuthClient(fetch, { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as any, 'client-id',
      vi.fn(), vi.fn(), vi.fn(), { get: vi.fn(), put: vi.fn() })
    const app = { getAllAccounts: vi.fn().mockResolvedValue([account]), acquireTokenSilent: vi.fn(acquireTokenSilent) }
    vi.spyOn(client as any, 'getOAuthApp').mockResolvedValue(app)
    return { client, app }
  }

  it('uses the saved home account id when the username is another alias', async () => {
    const { client, app } = await createClient(async () => ({ accessToken: 'ms', account }))
    const { result } = await client.authenticate('alias-b@example.com', ['XboxLive.signin'], { slientOnly: true, homeAccountId: 'home-1' })
    expect(result.account).toBe(account)
    expect(app.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ account }))
  })

  it('misses silently without the id when only another alias is saved', async () => {
    const { client } = await createClient(async () => ({ accessToken: 'ms', account }))
    await expect(client.authenticate('alias-b@example.com', ['XboxLive.signin'], { slientOnly: true }))
      .rejects.toMatchObject({ name: 'MicrosoftOAuthSlientFailed' })
  })

  it('reports being offline instead of a silent miss', async () => {
    const { client } = await createClient(async () => { throw Object.assign(new Error('no_network_connectivity'), { errorCode: 'no_network_connectivity' }) })
    const error = await client.authenticate('alias-a@example.com', ['XboxLive.signin'], { slientOnly: true }).catch(e => e)
    expect(error.name).not.toBe('MicrosoftOAuthSlientFailed')
    expect(isNetworkError(error)).toBe(true)
  })
})
