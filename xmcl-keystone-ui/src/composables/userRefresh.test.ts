import { AUTHORITY_DEV, AUTHORITY_MICROSOFT, UserException, getExceptionName } from '@xmcl/runtime-api'
import { describe, expect, it } from 'vitest'
import { getUserRefreshFailure, shouldRefreshOnSwitch } from './userRefresh'

const HOUR = 3600_000

describe('shouldRefreshOnSwitch', () => {
  const now = Date.now()
  it('refreshes a Microsoft account that is expired, invalidated or expiring soon', () => {
    expect(shouldRefreshOnSwitch({ authority: AUTHORITY_MICROSOFT, expiredAt: now - HOUR, invalidated: false }, now)).toBe(true)
    expect(shouldRefreshOnSwitch({ authority: AUTHORITY_MICROSOFT, expiredAt: now + HOUR, invalidated: false }, now)).toBe(true)
    expect(shouldRefreshOnSwitch({ authority: AUTHORITY_MICROSOFT, expiredAt: now + 20 * HOUR, invalidated: true }, now)).toBe(true)
  })

  it('leaves a fresh Microsoft account and offline accounts alone', () => {
    expect(shouldRefreshOnSwitch({ authority: AUTHORITY_MICROSOFT, expiredAt: now + 20 * HOUR, invalidated: false }, now)).toBe(false)
    expect(shouldRefreshOnSwitch({ authority: AUTHORITY_DEV, expiredAt: now - HOUR, invalidated: true }, now)).toBe(false)
  })
})

describe('getUserRefreshFailure', () => {
  const expired = (reason?: 'SIGN_IN_REQUIRED' | 'RATE_LIMITED' | 'NETWORK_ERROR') =>
    // As it arrives over IPC: a plain object with the exception's name and payload.
    JSON.parse(JSON.stringify({ name: 'UserException', message: 'x', exception: { type: 'userAccessTokenExpired', reason } }))

  it('maps the main process reason to what the user can do', () => {
    expect(getUserRefreshFailure(expired('SIGN_IN_REQUIRED'))).toBe('sign-in')
    expect(getUserRefreshFailure(expired('RATE_LIMITED'))).toBe('rate-limited')
    expect(getUserRefreshFailure(expired('NETWORK_ERROR'))).toBe('offline')
    expect(getUserRefreshFailure(expired())).toBe('failed')
    expect(getUserRefreshFailure(new UserException({ type: 'userAccessTokenExpired', reason: 'SIGN_IN_REQUIRED' }))).toBe('sign-in')
    expect(getUserRefreshFailure(new Error('boom'))).toBe('failed')
  })
})

describe('UserException name', () => {
  it('does not depend on the class name, which the renderer bundle drops', () => {
    // The production bundle emits `var t = class extends Exception {}`; the static name keeps isException working.
    expect(Object.getOwnPropertyDescriptor(UserException, 'exceptionName')?.value).toBe('UserException')
    expect(getExceptionName(UserException)).toBe('UserException')
  })
})
