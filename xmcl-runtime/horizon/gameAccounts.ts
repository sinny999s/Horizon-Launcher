/**
 * Horizon Client: the launcher's accounts, for the games it starts.
 *
 * The Horizon mod has an Accounts screen on its title screen that switches account without a restart. The launcher's
 * sign-ins live with the launcher (in Windows' account broker), and only it can renew them, so a game asks the
 * launcher: over the launcher's own localhost server, which the game finds through two environment variables it is
 * started with:
 *
 *   HORIZON_LAUNCHER_BRIDGE       http://127.0.0.1:<port>/horizon/accounts
 *   HORIZON_LAUNCHER_BRIDGE_KEY   a random key, new each time the launcher starts
 *
 *   GET  <bridge>          -> { launcher, accounts: [{ id, uuid, name, skin, signedOut }] }
 *   POST <bridge>/token    { "id": "<account id>" } -> { uuid, name, accessToken, expiresAt }
 *
 * The token request renews the account first, quietly, when its Minecraft token is expired, invalidated, about to
 * expire or no longer accepted (the same check the launcher makes before a launch). Errors are
 * `{ error: 'sign_in_required' | 'rate_limited' | 'offline' | 'not_found' | 'failed', message }`.
 *
 * Both requests need `Authorization: Bearer <key>` and must come from this computer: the launcher's server listens on
 * every interface, and a token must never leave the machine. Nothing here logs a token or the key.
 *
 * This file is the bridge's logic, apart from the app so it can be tested; pluginGameAccounts.ts serves it.
 */
import { AUTHORITY_MICROSOFT, type UserProfile } from '@xmcl/runtime-api'
import { timingSafeEqual } from 'crypto'

export const BRIDGE_PATH = '/horizon/accounts'

/** An account as a game sees it: no email, no token. */
export interface GameAccount {
  /** The launcher's id for the account, to ask for its token with. */
  id: string
  /** The Minecraft profile's id (32 hex digits) and name. */
  uuid: string
  name: string
  /** The skin's texture URL, for the game to draw the account's face. */
  skin: string
  /** The last quiet sign-in was turned down: the account has to be signed in again, in the launcher. */
  signedOut: boolean
}

export interface GameAccountsRequest {
  method: string
  /** The request's path, e.g. `/horizon/accounts/token`. */
  path: string
  authorization?: string
  /** Where the request came from; undefined when it didn't come over the launcher's server at all. */
  remoteAddress?: string
  /** The request's body, read on demand. */
  body: () => Promise<string>
}

export interface GameAccountsResponse {
  status: number
  body: Record<string, unknown>
}

export interface GameAccountsDeps {
  key: string
  launcher: string
  users(): Record<string, UserProfile>
  /** Renews the account's Minecraft token when it needs it, without any window. Throws when it can't. */
  refresh(id: string): Promise<unknown>
  token(user: UserProfile): Promise<string | undefined>
}

/** The accounts a game can play as: Microsoft accounts that own the game (have a profile), in the launcher's order. */
export function listGameAccounts(users: Record<string, UserProfile>, signedOut: ReadonlySet<string> = new Set()): GameAccount[] {
  const accounts: GameAccount[] = []
  for (const user of Object.values(users)) {
    if (user.authority !== AUTHORITY_MICROSOFT) continue
    const profile = user.profiles?.[user.selectedProfile]
    if (!profile?.id || !profile.name) continue
    accounts.push({
      id: user.id,
      uuid: profile.id,
      name: profile.name,
      skin: profile.textures?.SKIN?.url ?? '',
      // `invalidated` alone also covers a refresh that was rate limited or offline, which the next try fixes.
      signedOut: !!user.invalidated && signedOut.has(user.id),
    })
  }
  return accounts
}

export function isLoopbackAddress(address: string | undefined) {
  if (!address) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function isAuthorized(header: string | undefined, key: string) {
  const expected = Buffer.from(`Bearer ${key}`)
  const actual = Buffer.from(typeof header === 'string' ? header : '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function failure(status: number, error: string, message: string): GameAccountsResponse {
  return { status, body: { error, message } }
}

/** Why a quiet refresh failed, as `UserService.refreshUser` reports it. */
export function refreshFailureReason(error: unknown): string | undefined {
  const exception = (error as { exception?: { type?: string; reason?: string } } | undefined)?.exception
  return exception?.type === 'userAccessTokenExpired' ? exception.reason : undefined
}

/**
 * Answers one request to the bridge. `signedOut` remembers the accounts whose quiet sign-in was turned down, for the
 * listing. Returns undefined for a path that isn't the bridge's.
 */
export async function handleGameAccountsRequest(
  request: GameAccountsRequest,
  deps: GameAccountsDeps,
  signedOut: Set<string> = new Set(),
): Promise<GameAccountsResponse | undefined> {
  if (request.path !== BRIDGE_PATH && request.path !== `${BRIDGE_PATH}/token`) return undefined
  // The same answer whatever is wrong, so nothing can be learned by probing.
  if (!isLoopbackAddress(request.remoteAddress) || !isAuthorized(request.authorization, deps.key)) {
    return failure(403, 'forbidden', 'Only a game this launcher started can ask for its accounts')
  }

  if (request.path === BRIDGE_PATH) {
    if (request.method !== 'GET') return failure(405, 'method_not_allowed', 'GET lists the accounts')
    return { status: 200, body: { launcher: deps.launcher, accounts: listGameAccounts(deps.users(), signedOut) } }
  }

  if (request.method !== 'POST') return failure(405, 'method_not_allowed', 'POST { id } asks for a token')
  let id: unknown
  try {
    id = JSON.parse(await request.body())?.id
  } catch {
    return failure(400, 'bad_request', 'The request is not JSON')
  }
  const known = typeof id === 'string' ? deps.users()[id] : undefined
  if (!known || known.authority !== AUTHORITY_MICROSOFT) {
    return failure(404, 'not_found', 'That account is no longer in the launcher')
  }
  const name = known.profiles?.[known.selectedProfile]?.name ?? 'this account'

  try {
    await deps.refresh(known.id)
    signedOut.delete(known.id)
  } catch (e) {
    const reason = refreshFailureReason(e)
    if (reason === 'RATE_LIMITED') return failure(429, 'rate_limited', "Minecraft's sign-in is busy. Try again in a minute")
    if (reason === 'NETWORK_ERROR') return failure(503, 'offline', "The launcher couldn't reach Microsoft. Check your connection")
    if (reason === 'SIGN_IN_REQUIRED') {
      signedOut.add(known.id)
      return failure(401, 'sign_in_required', `Sign in to ${name} again in the Horizon launcher`)
    }
    return failure(502, 'failed', `The launcher couldn't sign ${name} in. Try again`)
  }

  // The refresh may have replaced the profile (a changed name).
  const user = deps.users()[known.id] ?? known
  const profile = user.profiles?.[user.selectedProfile]
  const accessToken = await deps.token(user).catch(() => undefined)
  if (!profile?.id || !profile.name || !accessToken) {
    signedOut.add(known.id)
    return failure(401, 'sign_in_required', `Sign in to ${name} again in the Horizon launcher`)
  }
  return { status: 200, body: { uuid: profile.id, name: profile.name, accessToken, expiresAt: user.expiredAt } }
}

/** The environment variable a game is given the bridge's key in. Its value must never be logged. */
export const BRIDGE_KEY_ENV = 'HORIZON_LAUNCHER_BRIDGE_KEY'

let bridge: { key: string; port: () => Promise<number | undefined> | undefined } | undefined

/**
 * Called once the bridge is being served (pluginGameAccounts): the key, and how to ask for the launcher server's port
 * (asked at launch time: the server starts listening after the plugins are set up).
 */
export function setGameAccountsBridge(key: string, port: () => Promise<number | undefined> | undefined) {
  bridge = { key, port }
}

/** What a game is started with so it can reach the bridge; nothing when the bridge isn't up. */
export async function gameAccountsEnv(): Promise<Record<string, string>> {
  if (!bridge) return {}
  try {
    const port = await bridge.port()
    if (typeof port !== 'number' || !(port > 0)) return {}
    return {
      HORIZON_LAUNCHER_BRIDGE: `http://127.0.0.1:${port}${BRIDGE_PATH}`,
      [BRIDGE_KEY_ENV]: bridge.key,
    }
  } catch {
    return {}
  }
}
