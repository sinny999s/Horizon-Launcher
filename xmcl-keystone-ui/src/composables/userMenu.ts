import { useEventBus } from '@vueuse/core'
import { ref, watch } from 'vue'

export type UserMenuRequest = 'overview' | 'login'

/** What the login dialog opens with when an account has to be signed in again. */
export interface SignInAgainRequest {
  username: string
  authority: string
  /** Why the sign-in is needed, shown above the form. */
  notice: string
}

const shown = ref(false)
const signInRequest = ref<SignInAgainRequest | undefined>()

export function useUserMenuControl() {
  const bus = useEventBus<UserMenuRequest>('user-menu-control')

  return {
    on: bus.on,
    shown,
    signInRequest,
    show(mode: UserMenuRequest = 'overview') {
      shown.value = true
      bus.emit(mode)
    },
    /**
     * Opens the login dialog for an account whose saved sign-in was rejected, with its email filled in and the
     * reason shown above the form.
     */
    signInAgain(request: SignInAgainRequest) {
      signInRequest.value = request
      shown.value = true
      bus.emit('login')
    },
    showAndWait(mode: UserMenuRequest = 'overview') {
      shown.value = true
      bus.emit(mode)
      return new Promise<void>((resolve) => {
        const stop = watch(shown, (value) => {
          if (value) return
          stop()
          resolve()
        })
      })
    },
  }
}
