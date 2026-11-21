/**
 * Horizon Client: serves the launcher's accounts to the games it starts (see gameAccounts.ts) on the launcher's own
 * localhost server.
 */
import { randomBytes } from 'crypto'
import type { LauncherApp, LauncherAppPlugin } from '~/app'
import { isNetworkError } from '~/user/accountSystems/MicrosoftAuthErrors'
import { UserService } from '~/user/UserService'
import { kUserTokenStorage } from '~/user/userTokenStore'
import { BRIDGE_PATH, failure, handleGameAccountsRequest, refreshFailureReason, setGameAccountsBridge } from './gameAccounts'

async function readBody(body: unknown): Promise<string> {
  if (typeof body === 'string') return body
  if (Buffer.isBuffer(body)) return body.toString('utf-8')
  if (!body || typeof (body as AsyncIterable<Buffer>)[Symbol.asyncIterator] !== 'function') return ''
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.length
    if (size > 4096) throw new Error('Request too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export const pluginGameAccounts: LauncherAppPlugin = (app: LauncherApp) => {
  const logger = app.getLogger('GameAccounts')
  const key = randomBytes(32).toString('base64url')
  const signedOut = new Set<string>()
  setGameAccountsBridge(key, () => app.serverPort)

  app.protocol.registerHandler('xmcl', async ({ request, response }) => {
    if (request.url.host !== 'launcher' || !request.url.pathname.startsWith(BRIDGE_PATH)) return
    // Over the launcher's server the body is the incoming request itself, which says where it came from. A link
    // opened in the launcher or dropped on it has no such thing, and gets nothing.
    const socket = (request.body as { socket?: { remoteAddress?: string } } | undefined)?.socket
    const userService = await app.registry.get(UserService)
    const tokenStorage = await app.registry.get(kUserTokenStorage)
    const result = await handleGameAccountsRequest({
      method: request.method,
      path: request.url.pathname,
      authorization: request.headers.authorization,
      remoteAddress: socket?.remoteAddress,
      body: () => readBody(request.body),
    }, {
      key,
      launcher: `Horizon Client ${app.version}`,
      users: () => userService.state.users,
      refresh: id => userService.refreshUser(id, { silent: true, validate: true }).catch((e) => {
        // Checking the token is a request of its own; when that can't get out, say "offline" rather than "failed".
        if (!refreshFailureReason(e) && isNetworkError(e)) throw { exception: { type: 'userAccessTokenExpired', reason: 'NETWORK_ERROR' } }
        throw e
      }),
      token: user => tokenStorage.get(user),
    }, signedOut).catch((e) => {
      logger.warn(`A game's account request failed: ${e instanceof Error ? e.name : 'error'}`)
      return failure(500, 'failed', 'The launcher ran into a problem')
    })
    if (!result) return
    if (result.status !== 200 && result.status !== 403) logger.log(`A game's account request was answered ${result.status} ${String(result.body.error)}`)
    response.status = result.status
    response.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }
    response.body = JSON.stringify(result.body)
    response.handled = true
  })
}
