import { computed, InjectionKey, reactive, ref, Ref, toRefs } from 'vue'
import { GameProfileAndTexture, OfficialUserServiceKey, UserProfile, UserServiceKey, UserState } from '@xmcl/runtime-api'

import { useService } from '@/composables'
import { useLocalStorage } from '@vueuse/core'
import { useState } from './syncableState'
import { GameProfile } from '@xmcl/user'
import { shouldRefreshOnSwitch, useUserRefreshFailureHandler } from './userRefresh'

const NO_USER_PROFILE: UserProfile = Object.freeze({
  selectedProfile: '',
  invalidated: true,
  authority: '',
  profileService: '',
  profiles: {},
  id: '',
  username: '',
  expiredAt: -1 })
const NO_GAME_PROFILE: GameProfileAndTexture = Object.freeze({
  id: '',
  name: '',
  textures: { SKIN: { url: '' } } })

export const kUserContext: InjectionKey<ReturnType<typeof useUserContext>> = Symbol('UserContext')

export function useUserContext() {
  const { getUserState, refreshUser } = useService(UserServiceKey)
  const { state, isValidating, error } = useState(getUserState, class extends UserState {
    override gameProfileUpdate({ profile, userId }: { userId: string; profile: (GameProfileAndTexture | GameProfile) }) {
      const userProfile = this.users[userId]
      if (!userProfile) return
      const instance = { textures: { SKIN: { url: '' } }, ...profile }
      // Replace the entire user object so the computed chain propagates
      // through the shallowRef (same object reference === no reactivity)
      this.users[userId] = {
        ...userProfile,
        profiles: {
          ...userProfile.profiles,
          [profile.id]: instance,
        },
      }
    }

    override userProfileRemove(userId: string) {
      delete this.users[userId]
    }

    override userProfile(user: UserProfile) {
      // MUST replace the user object entirely (not mutate in-place).
      // The state is a shallowRef; triggerRef(state) forces `userProfile`
      // computed to re-run, but if it returns the same object reference,
      // Vue won't propagate to dependents like `gameProfile`.
      // By creating a new object, the computed returns a fresh reference
      // and the entire reactive chain updates correctly.
      if (this.users[user.id]) {
        const current = this.users[user.id]
        this.users[user.id] = {
          ...current,
          avatar: user.avatar,
          expiredAt: user.expiredAt,
          profiles: user.profiles,
          username: user.username,
          selectedProfile: user.selectedProfile,
          invalidated: user.invalidated,
          homeAccountId: user.homeAccountId ?? current.homeAccountId,
        }
      } else {
        this.users[user.id] = user
      }
    }
  })
  const selectedUserId = useLocalStorage('selectedUserId', '', { writeDefaults: false })
  const userProfile: Ref<UserProfile> = computed(() => state.value?.users[selectedUserId.value] ?? NO_USER_PROFILE)
  const gameProfile: Ref<GameProfileAndTexture> = computed(() => userProfile.value.profiles[userProfile.value.selectedProfile] ?? NO_GAME_PROFILE)
  const users = computed(() => Object.values(state.value?.users || {}))

  // Switching to an account whose Minecraft token is expired or about to expire refreshes it silently with the
  // saved Microsoft sign-in, as a launch would. Only a rejected sign-in asks the user to sign in again.
  const refreshingUserId = ref('')
  const onRefreshFailed = useUserRefreshFailureHandler()
  async function refreshOnSwitch(id: string) {
    const user = state.value?.users[id]
    if (!user || !shouldRefreshOnSwitch(user)) return
    refreshingUserId.value = id
    try {
      await refreshUser(id, { silent: true })
    } catch (e) {
      // Only bother the user about the account they are still on.
      if (selectedUserId.value === id) onRefreshFailed(state.value?.users[id] ?? user, e)
    } finally {
      if (refreshingUserId.value === id) refreshingUserId.value = ''
    }
  }

  /** Selects an account, refreshing its token first when it expired or expires soon. */
  const select = (id: string) => {
    selectedUserId.value = id
    void refreshOnSwitch(id)
  }

  // Falling back to the first account (none selected yet, or the selected one was removed) is not a switch the
  // user asked for, so it doesn't refresh or prompt: startup and the next launch refresh it.
  watch(userProfile, (profile) => {
    if (profile === NO_USER_PROFILE) {
      // Select the first user
      const first = users.value[0]
      if (first) {
        selectedUserId.value = first.id
      }
    }
  }, { immediate: true })

  watch(state, (s) => {
    if (!s) return
    if (userProfile.value === NO_USER_PROFILE) {
      // Select the first user
      const first = users.value[0]
      if (first) {
        selectedUserId.value = first.id
      }
    }
  })

  return {
    users,
    isValidating,
    error,
    select,
    refreshingUserId,
    userProfile,
    gameProfile }
}

export function useUserExpired(user: Ref<UserProfile | undefined>) {
  return computed(() => !user.value || user.value?.invalidated || user.value.expiredAt < Date.now())
}

export const isValidEmail = (value: string) => /^[\w-]+(?:\.[\w-]+)*@[\w-]+(?:\.[\w-]+)*\.\w{2,6}$/.test(value)

export function useLoginValidation(emailOnly: Ref<boolean>, isOffline?: Ref<boolean>) {
  const { t } = useI18n()
  const nameRules = computed(() => {
    const rules: ((v: any) => string | boolean)[] = [
      (v: unknown) => !!v || t('loginError.requireUsername')
    ]
    if (isOffline?.value) {
      rules.push((v: string) => !/[а-яА-ЯёЁ]/.test(v) || t('loginError.cyrillicNotAllowed'))
      rules.push((v: string) => /^[a-zA-Z0-9_]{3,16}$/.test(v) || t('loginError.illegalOfflineUsername'))
    }
    return rules
  })
  const emailRules = [
    (v: unknown) => !!v || t('loginError.requireEmail'),
    (v: string) => isValidEmail(v) ||
      t('loginError.illegalEmail'),
  ]
  const passwordRules = [(v: unknown) => !!v || t('loginError.requirePassword')]
  const usernameRules = computed(() => emailOnly.value ? emailRules : nameRules.value)
  return {
    usernameRules,
    passwordRules }
}

export function useMojangSecurityStatus() {
  const security = computed(() => true)

  return {
    security,
    refreshing: ref(false) }
}

export function useMojangSecurity(profile: Ref<UserProfile>) {
  interface MojangChallenge {
    readonly answer: {
      id: number
      answer: string
    }
    readonly question: {
      id: number
      question: string
    }
  }

  const { security, refreshing } = useMojangSecurityStatus()
  const { getSecurityChallenges: getChallenges, verifySecurityLocation: checkLocation, submitSecurityChallenges: submitChallenges } = useService(OfficialUserServiceKey)
  const data = reactive({
    loading: false,
    challenges: [] as MojangChallenge[],
    error: undefined as any })
  async function check() {
    try {
      if (data.loading) return
      if (data.challenges.length > 0) return
      data.loading = true
      const sec = await checkLocation(profile.value)
      if (sec) return
      try {
        const challenges = await getChallenges(profile.value)
        data.challenges = challenges.map(c => ({ question: c.question, answer: { id: c.answer.id, answer: '' } }))
      } catch (e) {
        data.error = e
      }
    } finally {
      data.loading = false
    }
  }
  async function submit() {
    data.loading = true
    try {
      await submitChallenges(profile.value, data.challenges.map(c => c.answer))
    } catch (e) {
      data.error = e
    } finally {
      data.loading = false
    }
  }
  return {
    ...toRefs(data),
    refreshing,
    security,
    check,
    submit }
}
