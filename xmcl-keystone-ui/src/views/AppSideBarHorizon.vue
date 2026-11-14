<template>
  <nav
    data-testid="app-sidebar"
    aria-label="Sidebar navigation"
    class="hz-side moveable z-10"
  >
    <div class="hz-brand">
      <span class="hz-brand__mark" role="img" aria-label="Horizon" />
      <small>Client</small>
    </div>

    <div class="hz-cat">
      Menu
    </div>
    <div v-roving-tabindex role="group" class="hz-group">
      <button
        v-for="n of nav"
        :key="n.key"
        type="button"
        class="hz-nav non-moveable"
        :class="{ active: n.active }"
        :data-testid="n.testid"
        @click="n.go()"
      >
        <v-icon class="hz-nav__ico" :size="19">
          {{ n.icon }}
        </v-icon>
        <span>{{ n.label }}</span>
      </button>
    </div>

    <div class="hz-cat hz-cat--row">
      <span>Instances</span>
      <button
        id="create-instance-button"
        data-testid="create-instance"
        v-shared-tooltip.right="() => t('instances.add')"
        type="button"
        class="hz-add non-moveable"
        :aria-label="t('instances.add')"
        @click="showAddInstance()"
      >
        <v-icon :size="16">
          add
        </v-icon>
      </button>
    </div>
    <div ref="instancesScrollEl" v-roving-tabindex role="group" class="hz-instances">
      <AppSideBarHorizonInstance
        v-for="p of instancePaths"
        :key="p"
        :path="p"
      />
      <button
        v-if="instancePaths.length === 0"
        type="button"
        class="hz-empty non-moveable"
        @click="showAddInstance()"
      >
        {{ t('instances.add') }}
      </button>
    </div>

    <button
      v-if="updateStage !== 'none'"
      type="button"
      data-testid="launcher-update"
      class="hz-update non-moveable"
      :class="updateStage"
      :disabled="updateStage === 'downloading' || updateBusy"
      @click="updateAct()"
    >
      <v-icon class="hz-update__ico" :size="18">
        {{ updateRow.icon }}
      </v-icon>
      <span class="hz-update__text">
        <b>{{ updateRow.title }}</b>
        <small>{{ updateRow.sub }}</small>
      </span>
    </button>

    <button
      id="my-stuff-button"
      data-testid="nav-accounts"
      type="button"
      class="hz-profile non-moveable"
      :aria-label="t('myStuff')"
      @click="router.push('/me')"
      @contextmenu.prevent="onAccountContextMenu"
    >
      <PlayerAvatar
        class="hz-profile__av"
        :src="gameProfile?.textures?.SKIN?.url"
        :dimension="32"
      />
      <span class="hz-profile__text">
        <b>{{ gameProfile?.name || t('userAccount.add') }}</b>
        <small>{{ accountKind }}</small>
      </span>
      <v-icon class="hz-profile__chev" :size="18">
        unfold_more
      </v-icon>
    </button>
  </nav>

  <AppSideBarAccountMenu ref="accountMenu" location="end bottom" />
</template>

<script lang="ts" setup>
/**
 * Horizon Client: the sidebar, replacing XMCL's icon rail. It follows the Horizon ClickGUI's sidebar
 * (design/clickgui in the mod): the wordmark, small uppercase section labels, icon + label rows with a soft
 * pill on the active one, the instance list, and the account card at the bottom.
 */
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useDialog } from '@/composables/dialog'
import { useDragAutoScroll } from '@/composables/dragAutoScroll'
import { useHorizonUpdate } from '@/composables/horizonUpdate'
import { useInstanceGroup } from '@/composables/instanceGroup'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kUserContext } from '@/composables/user'
import { vRovingTabindex } from '@/directives/rovingTabindex'
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { injection } from '@/util/inject'
import { useEventListener } from '@vueuse/core'
import AppSideBarAccountMenu from './AppSideBarAccountMenu.vue'
import AppSideBarHorizonInstance from './AppSideBarHorizonInstance.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { gameProfile, userProfile } = injection(kUserContext)
const { show: showAddInstance } = useDialog(AddInstanceDialogKey)
const { groups } = useInstanceGroup()

/** XMCL's instance groups, flattened: the sidebar lists every instance in its saved order. */
const instancePaths = computed(() => groups.value.flatMap(g => typeof g === 'string' ? [g] : g.instances))

const inHome = computed(() => route.matched[0]?.path === '/' && route.query.browse !== '1')
const nav = computed(() => [
  { key: 'play', icon: 'sports_esports', label: 'Play', testid: 'nav-home', active: inHome.value, go: () => router.push('/') },
  { key: 'browse', icon: 'travel_explore', label: 'Browse mods', testid: 'nav-store', active: route.path === '/mods' && route.query.browse === '1', go: () => router.push({ path: '/mods', query: { browse: '1' } }) },
  { key: 'me', icon: 'checkroom', label: 'Accounts & skins', testid: 'nav-me', active: route.path.startsWith('/me'), go: () => router.push('/me') },
  { key: 'setting', icon: 'settings', label: 'Settings', testid: 'nav-settings', active: route.path.startsWith('/setting'), go: () => router.push('/setting') },
])

const accountKind = computed(() => {
  const a = userProfile.value?.authority
  if (!a) return ''
  if (a === 'microsoft') return 'Microsoft'
  if (a === 'offline') return 'Offline'
  try { return new URL(a).host } catch { return a }
})

// The launcher's own update, shown above the account card once there is one.
const { stage: updateStage, version: updateVersion, percent: updatePercent, busy: updateBusy, act: updateAct } = useHorizonUpdate()
const updateRow = computed(() => {
  const v = updateVersion.value
  switch (updateStage.value) {
    case 'ready': return { icon: 'restart_alt', title: 'Restart to update', sub: `Horizon Client ${v}` }
    case 'downloading': return { icon: 'downloading', title: 'Downloading update', sub: `${v} · ${updatePercent.value}%` }
    case 'download': return { icon: 'system_update_alt', title: 'Update available', sub: `${v} · click to download` }
    default: return { icon: 'open_in_new', title: 'Update available', sub: `${v} · open the download page` }
  }
})

const accountMenu = ref<InstanceType<typeof AppSideBarAccountMenu>>()
function onAccountContextMenu(event: MouseEvent) {
  accountMenu.value?.open(event)
}

// Alt+Left goes back, as in XMCL's sidebar (its back button is gone here).
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!e.altKey || e.key !== 'ArrowLeft' || e.ctrlKey || e.metaKey || e.shiftKey) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  e.preventDefault()
  router.back()
})

const instancesScrollEl = ref<HTMLDivElement | null>(null)
useDragAutoScroll(instancesScrollEl)
</script>

<style scoped>
.hz-side {
  width: 236px;
  min-width: 236px;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 6px 12px 12px;
  background: linear-gradient(180deg, rgba(20, 20, 24, .72), rgba(12, 12, 15, .82));
  border-right: 1px solid var(--hz-line);
  backdrop-filter: blur(24px) saturate(130%);
}

.hz-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 46px;
  padding: 0 8px 4px;
}
.hz-brand__mark {
  display: block;
  width: 104px;
  height: 24.4px;
  background: #fff;
  -webkit-mask: url('@/assets/horizon/wordmark.svg') center / contain no-repeat;
  mask: url('@/assets/horizon/wordmark.svg') center / contain no-repeat;
}
.hz-brand small {
  font: 600 10px var(--hz-font);
  color: var(--hz-t3);
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--hz-fill);
  border: 1px solid var(--hz-line);
}

.hz-cat {
  font: 700 10px var(--hz-font);
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: var(--hz-t4);
  padding: 14px 10px 6px;
}
.hz-cat--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 4px;
  padding-bottom: 4px;
}

.hz-group { display: flex; flex-direction: column; gap: 2px; }

.hz-side button {
  appearance: none;
  background: none;
  border: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  outline: none;
}
.hz-side button:focus-visible { box-shadow: 0 0 0 2px rgba(255, 255, 255, .25); }

.hz-side .hz-nav {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 10px;
  color: var(--hz-t2);
  font: 500 13.5px var(--hz-font);
  text-align: left;
  transition: color .25s, background .25s;
}
.hz-nav span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-nav:hover { color: var(--hz-t1); background: var(--hz-fill); }
.hz-nav.active {
  color: #fff;
  background: linear-gradient(90deg, rgba(255, 255, 255, .09), rgba(255, 255, 255, .04));
}
.hz-nav__ico { color: inherit; transition: transform .4s var(--hz-spring); }
.hz-nav.active .hz-nav__ico { transform: scale(1.08); }

.hz-add {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--hz-t3);
  transition: background .2s, color .2s;
}
.hz-add:hover { background: var(--hz-fill2); color: var(--hz-t1); }

.hz-instances {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: none;
}
.hz-instances::-webkit-scrollbar { display: none; }

.hz-side .hz-empty {
  height: 40px;
  border-radius: 11px;
  border: 1px dashed var(--hz-line2);
  color: var(--hz-t3);
  font: 500 12.5px var(--hz-font);
}
.hz-empty:hover { color: var(--hz-t1); border-color: rgba(255, 255, 255, .2); }

.hz-side .hz-update {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 13px;
  background: var(--hz-fill);
  border: 1px solid var(--hz-line);
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  transition: background .2s, border-color .2s, filter .2s;
}
.hz-update:hover:not(:disabled) { background: var(--hz-fill2); border-color: var(--hz-line2); }
.hz-side .hz-update:disabled { cursor: default; }
.hz-side .hz-update.ready {
  background: linear-gradient(135deg, rgba(244, 56, 56, .17), rgba(239, 71, 71, .05) 70%), rgba(255, 255, 255, .03);
  border-color: rgba(244, 56, 56, .28);
}
.hz-update.ready:hover:not(:disabled) { filter: brightness(1.12); }
.hz-update__ico { width: 32px; flex: none; color: var(--hz-t2); }
.hz-update.ready .hz-update__ico { color: #ff9a9a; }
.hz-update__text { min-width: 0; flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.hz-update__text b { font: 600 12.5px var(--hz-font); color: var(--hz-t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-update__text small { font: 500 11px var(--hz-font); color: var(--hz-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.hz-side .hz-profile {
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 13px;
  background: var(--hz-fill);
  border: 1px solid var(--hz-line);
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  transition: background .2s, border-color .2s;
}
.hz-profile:hover { background: var(--hz-fill2); border-color: var(--hz-line2); }
.hz-profile__av { width: 32px; height: 32px; border-radius: 9px; overflow: hidden; flex: none; }
.hz-profile__text { min-width: 0; flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.hz-profile__text b { font: 600 12.5px var(--hz-font); color: var(--hz-t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-profile__text small { font: 500 11px var(--hz-font); color: var(--hz-t3); }
.hz-profile__chev { color: var(--hz-t3); }
</style>
