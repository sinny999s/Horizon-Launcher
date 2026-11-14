import { MicrosoftMinecraftXboxLoginError } from '@xmcl/user'

export function isAccountSuspendedError(error: unknown): error is MicrosoftMinecraftXboxLoginError {
  if (!(error instanceof MicrosoftMinecraftXboxLoginError) || error.status !== 403) return false
  try {
    return JSON.parse(error.body)?.details?.reason === 'ACCOUNT_SUSPENDED'
  } catch {
    return false
  }
}

export function isUserCanceledError(error: unknown) {
  const message = (error as Error | undefined)?.message
  return typeof message === 'string' &&
    (/\buser_cancel(?:led|ed)\b/.test(message) ||
      message === 'Microsoft authorization window was closed.')
}

/** MSAL's `network_error`, or the Windows broker's `no_network_connectivity` (offline). */
export function isNetworkError(error: unknown) {
  const candidate = error as { errorCode?: unknown; message?: unknown } | undefined
  return candidate?.errorCode === 'network_error' || candidate?.errorCode === 'no_network_connectivity' ||
    (typeof candidate?.message === 'string' && /\b(network_error|no_network_connectivity)\b/.test(candidate.message))
}

/**
 * A silent token request that failed for a reason a later try fixes (offline, or Microsoft's server down), not
 * because the saved sign-in is unusable. Such a failure must not be read as "sign in again".
 */
export function isTransientAuthError(error: unknown) {
  const code = (error as { errorCode?: unknown } | undefined)?.errorCode
  return isNetworkError(error) || code === 'server_unavailable' || code === 'temporarily_unavailable'
}
