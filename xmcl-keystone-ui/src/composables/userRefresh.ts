import { AUTHORITY_MICROSOFT, UserException, UserProfile, isException, isUserTokenExpiring } from '@xmcl/runtime-api'
import { inject } from 'vue'
import { kNotificationQueue, Notify, useNotifier } from './notifier'
import { useUserMenuControl } from './userMenu'

/**
 * What a failed silent refresh means for the user:
 * - `sign-in`: Microsoft rejected the saved sign-in, so only signing in again helps.
 * - `rate-limited`: Minecraft's login refused for now (429); it works again in a minute.
 * - `offline`: Microsoft or Minecraft couldn't be reached.
 * - `failed`: anything else.
 */
export type UserRefreshFailure = 'sign-in' | 'rate-limited' | 'offline' | 'failed'

export function getUserRefreshFailure(error: unknown): UserRefreshFailure {
  if (isException(UserException, error) && error.exception.type === 'userAccessTokenExpired') {
    switch (error.exception.reason) {
      case 'SIGN_IN_REQUIRED': return 'sign-in'
      case 'RATE_LIMITED': return 'rate-limited'
      case 'NETWORK_ERROR': return 'offline'
    }
  }
  return 'failed'
}

/** Whether a switch to this account should refresh its Minecraft token first (expired, invalidated or expiring). */
export function shouldRefreshOnSwitch(user: Pick<UserProfile, 'authority' | 'expiredAt' | 'invalidated'>, now = Date.now()) {
  return user.authority === AUTHORITY_MICROSOFT && isUserTokenExpiring(user, now)
}

/** The account's name for messages: its selected Minecraft name, else its email. */
export function getUserDisplayName(user: Pick<UserProfile, 'username' | 'profiles' | 'selectedProfile'>) {
  return user.profiles[user.selectedProfile]?.name || user.username
}

/**
 * Tells the user about a failed silent refresh. A rejected sign-in opens the login dialog for that account with
 * the reason; other failures are a notification, since signing in again wouldn't fix them.
 */
export function useUserRefreshFailureHandler() {
  // Without a notification queue (outside the main window) the message only goes to the console.
  const queue = inject(kNotificationQueue, undefined)
  const notify: Notify = queue ? useNotifier(queue).notify : n => console.warn(n.title, n.body)
  const { signInAgain } = useUserMenuControl()

  return (user: UserProfile, error: unknown) => {
    const failure = getUserRefreshFailure(error)
    const name = getUserDisplayName(user)
    if (failure === 'sign-in') {
      signInAgain({
        username: user.username,
        authority: user.authority,
        notice: `Microsoft needs you to sign in to ${name} (${user.username}) again: its saved sign-in has expired or was revoked. Sign in once and it refreshes by itself again.`,
      })
    } else if (failure === 'rate-limited') {
      notify({
        level: 'warning',
        title: `Couldn't refresh ${name} yet`,
        body: 'Minecraft is limiting logins right now. Try again in a minute; you won\'t need to sign in.',
      })
    } else if (failure === 'offline') {
      notify({
        level: 'warning',
        title: `Couldn't refresh ${name}`,
        body: 'Microsoft or Minecraft can\'t be reached. Check your connection and try again.',
      })
    } else {
      notify({
        level: 'error',
        title: `Couldn't refresh ${name}`,
        body: (error as Error | undefined)?.message || String(error),
      })
    }
  }
}
