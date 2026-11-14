<template>
  <div class="hz-accounts flex h-full overflow-hidden">
    <MeProfilePanel class="hz-accounts__skin" />
    <div class="hz-page hz-accounts__main">
      <header class="hz-accounts__head">
        <div>
          <h1 class="hz-h1">
            Accounts
          </h1>
          <div class="hz-sub">
            {{ entries.length }} {{ entries.length === 1 ? 'account' : 'accounts' }} · the one in use is the one you play as
          </div>
        </div>
        <div class="flex-grow" />
        <button type="button" class="hz-btn red" data-testid="add-account" @click="showUserProfileDialog('login')">
          <v-icon>person_add</v-icon>
          Add account
        </button>
      </header>

      <div class="hz-accounts__list">
        <div
          v-for="e of entries"
          :key="e.key"
          class="hz-card hz-acc"
          :class="{ on: e.isCurrent, click: !e.isCurrent }"
          @click="choose(e)"
        >
          <PlayerAvatar class="hz-acc__av" :src="e.profile?.textures?.SKIN?.url ?? ''" :dimension="40" />
          <div class="hz-acc__text">
            <b>{{ e.profile?.name || e.user.username }}</b>
            <small>{{ e.user.username }}</small>
          </div>
          <span class="hz-chip">{{ authorityName(e.user.authority) }}</span>
          <span v-if="refreshingUserId === e.user.id" class="hz-chip">Signing in…</span>
          <span
            v-else-if="isExpired(e.user)"
            class="hz-chip red"
            title="Its Minecraft token expired. It signs in again by itself when you switch to it or press Play."
          >Expired</span>
          <span v-if="e.isCurrent" class="hz-chip green">In use</span>
          <v-progress-circular v-if="selecting === e.key || refreshingUserId === e.user.id" indeterminate :size="16" :width="2" />
          <button
            type="button"
            class="hz-mini"
            :class="{ danger: confirmRemove === e.key }"
            :title="confirmRemove === e.key ? 'Click again to remove' : 'Remove account'"
            @click.stop="remove(e)"
          >
            <v-icon>{{ confirmRemove === e.key ? 'delete_forever' : 'logout' }}</v-icon>
            <span v-if="confirmRemove === e.key">Remove?</span>
          </button>
        </div>
        <div v-if="entries.length === 0" class="hz-accounts__empty">
          <v-icon>person</v-icon>
          <p>No accounts yet. Add your Microsoft account to play.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
/**
 * Horizon Client: the Accounts & skins page, replacing XMCL's "My stuff" (news feed and an instance list). XMCL's
 * skin and cape panel on the left, every account on the right: click one to play as it, add or remove accounts.
 * Sign-in still goes through XMCL's own Microsoft login dialog.
 */
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useService } from '@/composables'
import { kUserContext } from '@/composables/user'
import { useUserMenuControl } from '@/composables/userMenu'
import { injection } from '@/util/inject'
import { AUTHORITY_DEV, AUTHORITY_MICROSOFT, AUTHORITY_MOJANG, GameProfileAndTexture, UserProfile, UserServiceKey } from '@xmcl/runtime-api'
import MeProfilePanel from './MeProfilePanel.vue'

const { users, userProfile, select, refreshingUserId } = injection(kUserContext)
const { selectUserGameProfile, removeUser, removeUserGameProfile } = useService(UserServiceKey)
const { show: showUserProfileDialog } = useUserMenuControl()

interface Entry { key: string; user: UserProfile; profile?: GameProfileAndTexture; isCurrent: boolean }
const entries = computed<Entry[]>(() => users.value.flatMap((u): Entry[] => {
  const pids = Object.keys(u.profiles)
  if (!pids.length) return [{ key: u.id, user: u, profile: undefined, isCurrent: u.id === userProfile.value.id }]
  return pids.map((pid): Entry => ({ key: `${u.id}:${pid}`, user: u, profile: u.profiles[pid], isCurrent: u.id === userProfile.value.id && pid === u.selectedProfile }))
}))

function authorityName(a: string) {
  if (a === AUTHORITY_MICROSOFT) return 'Microsoft'
  if (a === AUTHORITY_MOJANG) return 'Mojang'
  if (a === AUTHORITY_DEV) return 'Offline'
  try { return new URL(a).host } catch { return a }
}
function isExpired(u: UserProfile) {
  return u.invalidated || u.expiredAt < Date.now()
}

const selecting = ref('')
async function choose(e: Entry) {
  if (selecting.value) return
  // The account in use: clicking it again refreshes it when it has expired.
  if (e.isCurrent) {
    if (isExpired(e.user) && !refreshingUserId.value) select(e.user.id)
    return
  }
  selecting.value = e.key
  try {
    if (e.profile && e.user.selectedProfile !== e.profile.id) await selectUserGameProfile(e.user, e.profile.id)
    select(e.user.id)
  } finally {
    selecting.value = ''
  }
}

const confirmRemove = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
async function remove(e: Entry) {
  if (confirmRemove.value !== e.key) {
    confirmRemove.value = e.key
    clearTimeout(timer)
    timer = setTimeout(() => { confirmRemove.value = '' }, 3000)
    return
  }
  confirmRemove.value = ''
  // An account with several profiles loses just this profile; the last one removes the account.
  if (e.profile && Object.keys(e.user.profiles).length > 1) await removeUserGameProfile(e.user, e.profile.id)
  else await removeUser(e.user)
}
</script>

<style scoped>
.hz-accounts__main { flex: 1; min-width: 0; overflow: auto; padding-top: 26px; display: flex; flex-direction: column; gap: 18px; }
.hz-accounts__head { display: flex; align-items: flex-end; gap: 12px; }
.hz-accounts__list { display: flex; flex-direction: column; gap: 8px; max-width: 760px; }
.hz-acc { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
.hz-acc__av { width: 40px; height: 40px; border-radius: 10px; overflow: hidden; flex: none; }
.hz-acc__text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.hz-acc__text b { font: 600 14px var(--hz-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-acc__text small { font: 500 11.5px var(--hz-font); color: var(--hz-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-mini {
  appearance: none; border: 0; background: none; cursor: pointer;
  height: 28px; min-width: 28px; padding: 0 7px; border-radius: 8px;
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--hz-t3); font: 600 11px var(--hz-font);
  transition: background .2s, color .2s;
}
.hz-mini .v-icon { font-size: 17px !important; }
.hz-mini:hover { background: var(--hz-fill2); color: var(--hz-t1); }
.hz-mini.danger { color: #ff8f8f; background: rgba(244, 56, 56, .14); }
.hz-accounts__empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 0; color: var(--hz-t3); font: 500 13px var(--hz-font); }
.hz-accounts__empty p { margin: 0; }
</style>
