<template>
  <div class="hz-page hz-overview select-none">
    <HomeCriticalError />

    <section class="hz-card hz-hero">
      <div class="hz-hero__main">
        <div class="hz-label">
          {{ horizonMod ? 'Horizon ' + horizonMod.version : 'Minecraft ' + (runtime.minecraft || '') }}
        </div>
        <h2 class="hz-hero__title">
          {{ heroTitle }}
        </h2>
        <p class="hz-hero__text">
          {{ heroText }}
        </p>
        <div class="hz-hero__stats">
          <div v-for="s of stats" :key="s.label" class="hz-stat">
            <span class="hz-label">{{ s.label }}</span>
            <b>{{ s.value }}</b>
          </div>
        </div>
      </div>
      <HorizonPlayButton big class="hz-hero__play" />
    </section>

    <div class="hz-overview__grid">
      <section class="hz-card hz-list-card">
        <header>
          <h3 class="hz-h2">
            Mods
          </h3>
          <span class="hz-chip" :class="{ red: enabledMods.length > 0 }">{{ enabledMods.length }} on</span>
          <div class="flex-grow" />
          <router-link to="/mods" class="hz-btn ghost">
            Manage
            <v-icon>chevron_right</v-icon>
          </router-link>
        </header>
        <div v-if="shownMods.length === 0" class="hz-empty-row">
          No mods enabled.
        </div>
        <router-link
          v-for="m of shownMods"
          :key="m.path"
          to="/mods"
          class="hz-row"
        >
          <img v-if="m.icon" :src="m.icon" class="hz-row__icon" draggable="false">
          <span v-else class="hz-row__icon hz-row__icon--empty"><v-icon>extension</v-icon></span>
          <span class="hz-row__text">
            <b>{{ m.name }}</b>
            <small>{{ m.version }}</small>
          </span>
          <span v-if="m.modId === 'horizon'" class="hz-chip red">Client</span>
        </router-link>
        <div v-if="enabledMods.length > shownMods.length" class="hz-more">
          and {{ enabledMods.length - shownMods.length }} more
        </div>
      </section>

      <section class="hz-card hz-list-card">
        <header>
          <h3 class="hz-h2">
            Worlds
          </h3>
          <span class="hz-chip">{{ saves.length }}</span>
          <div class="flex-grow" />
          <router-link to="/save" class="hz-btn ghost">
            All worlds
            <v-icon>chevron_right</v-icon>
          </router-link>
        </header>
        <div v-if="recentSaves.length === 0" class="hz-empty-row">
          No singleplayer worlds yet.
        </div>
        <router-link
          v-for="s of recentSaves"
          :key="s.path"
          to="/save"
          class="hz-row"
        >
          <img v-if="s.icon" :src="s.icon" class="hz-row__icon hz-row__icon--world" draggable="false">
          <span v-else class="hz-row__icon hz-row__icon--empty"><v-icon>public</v-icon></span>
          <span class="hz-row__text">
            <b>{{ s.levelName || s.name }}</b>
            <small>{{ modeName(s.mode) }} · {{ ago(s.lastPlayed) }}</small>
          </span>
        </router-link>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
/**
 * Horizon Client: the instance Overview, replacing XMCL's home dashboard and its "Content" card. A hero card
 * with the Play button and the instance's numbers, then the enabled mods and the latest worlds.
 */
import { useGlobalDrop } from '@/composables/dropHandler'
import { useDialog } from '@/composables/dialog'
import { useGamepadAction } from '@/composables/gamepad'
import { kInstance } from '@/composables/instance'
import { kInstanceModsContext } from '@/composables/instanceMods'
import { kInstanceSave } from '@/composables/instanceSave'
import { kUpstream } from '@/composables/instanceUpdate'
import { useLaunchButton } from '@/composables/launchButton'
import { kCompact } from '@/composables/scrollTop'
import { useTutorial } from '@/composables/tutorial'
import { useInFocusMode } from '@/composables/uiLayout'
import { injection } from '@/util/inject'
import type { DriveStep } from 'driver.js'
import HomeCriticalError from './HomeCriticalError.vue'
import HorizonPlayButton from './HorizonPlayButton.vue'

const { t } = useI18n()
const router = useRouter()
const { instance, runtime, name } = injection(kInstance)
const { enabledMods } = injection(kInstanceModsContext)
const { saves } = injection(kInstanceSave)

// XMCL's dashboard/focus switch doesn't exist here: keep its state on "focus" so other code that reads it agrees.
const isFocus = useInFocusMode()
isFocus.value = true

provide(kUpstream, computed(() => ({ upstream: instance.value.upstream, minecraft: instance.value.runtime.minecraft })))

const compact = injection(kCompact)
onMounted(() => { compact.value = false })

const horizonMod = computed(() => enabledMods.value.find(m => m.modId === 'horizon'))
const shownMods = computed(() => {
  const list = [...enabledMods.value].sort((a, b) => (a.modId === 'horizon' ? -1 : b.modId === 'horizon' ? 1 : a.name.localeCompare(b.name)))
  return list.slice(0, 7)
})
const recentSaves = computed(() => [...saves.value].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 6))

const heroTitle = computed(() => instance.value.lastPlayedDate ? 'Jump back in' : 'Ready when you are')
const heroText = computed(() => {
  if (!horizonMod.value) return 'Horizon isn\'t enabled in this instance. Turn it on in Mods.'
  return `${name.value || 'This instance'} runs Minecraft ${runtime.value.minecraft} with Fabric ${runtime.value.fabricLoader || ''}.`
})

function playtime(ms: number) {
  if (!ms) return '0m'
  const minutes = Math.floor(ms / 60000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function ago(time: number) {
  if (!time) return 'never'
  const diff = (time - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit)
  }
  return 'just now'
}
function modeName(mode: number | string) {
  const names: Record<string, string> = { 0: 'Survival', 1: 'Creative', 2: 'Adventure', 3: 'Spectator', '-1': 'Survival' }
  return names[String(mode)] ?? 'Survival'
}

const stats = computed(() => [
  { label: 'Playtime', value: playtime(instance.value.playtime || 0) },
  { label: 'Last played', value: ago(instance.value.lastPlayedDate || 0) },
  { label: 'Mods', value: String(enabledMods.value.length) },
  { label: 'Worlds', value: String(saves.value.length) },
])

const { show } = useDialog('HomeDropModpackDialog')
useGlobalDrop({
  onDrop: async (e) => {
    const file = e.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop()
      const filePath = windowController.getPathForFile(file)
      if ((ext === 'zip' || ext === 'mrpack') && filePath) {
        show(filePath)
      }
    }
  },
})

const { text: launchText, onClick: onLaunchClick } = useLaunchButton()
useGamepadAction('X', { label: () => launchText.value, handler: () => onLaunchClick() })
useGamepadAction('Y', { label: () => t('gamepad.guide.instanceSettings'), handler: () => router.push('/base-setting') })

useTutorial(computed(() => {
  const steps: DriveStep[] = [
    { element: '#my-stuff-button', popover: { title: t('userAccount.add'), description: t('tutorial.userAccountDescription') } },
    { element: '#create-instance-button', popover: { title: t('instances.add'), description: t('tutorial.instanceAddDescription') } },
    { element: '#launch-button', popover: { title: t('launch.launch'), description: t('tutorial.launchDescription') } },
  ]
  return steps
}))
</script>

<style scoped>
.hz-overview { display: flex; flex-direction: column; gap: 14px; padding-top: 6px; }

.hz-hero {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  padding: 24px 26px;
  min-height: 190px;
  background:
    radial-gradient(500px 220px at 85% 0%, rgba(244, 56, 56, .16), transparent 70%),
    linear-gradient(135deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .02));
}
.hz-hero__glow {
  position: absolute;
  right: -40px;
  top: -40px;
  width: 300px;
  height: 140px;
  opacity: .06;
  background: #fff;
  -webkit-mask: url('@/assets/horizon/wordmark.svg') center / contain no-repeat;
  mask: url('@/assets/horizon/wordmark.svg') center / contain no-repeat;
  pointer-events: none;
}
.hz-hero__main { flex: 1; min-width: 0; }
.hz-hero__title { font: 700 30px/1.1 var(--hz-font); letter-spacing: -.5px; margin: 8px 0 6px; }
.hz-hero__text { font: 500 13px/1.45 var(--hz-font); color: var(--hz-t2); margin: 0; max-width: 520px; }
.hz-hero__stats { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.hz-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 13px;
  min-width: 96px;
  border-radius: 11px;
  background: rgba(0, 0, 0, .22);
  border: 1px solid var(--hz-line);
}
.hz-stat b { font: 600 14px var(--hz-font); font-variant-numeric: tabular-nums; }
.hz-hero__play { flex: none; }

.hz-overview__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 1000px) { .hz-overview__grid { grid-template-columns: 1fr; } }

.hz-list-card { padding: 12px 10px 10px; display: flex; flex-direction: column; gap: 2px; }
.hz-list-card header { display: flex; align-items: center; gap: 8px; padding: 0 6px 8px; }
.hz-list-card header .hz-btn { height: 28px; padding: 0 8px 0 10px; font-size: 12px; }

.hz-row {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 44px;
  padding: 0 8px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--hz-t1);
  transition: background .2s;
}
.hz-row:hover { background: var(--hz-fill); }
.hz-row__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex: none;
  object-fit: cover;
  background: var(--hz-fill2);
}
.hz-row__icon--world { image-rendering: pixelated; }
.hz-row__icon--empty { display: grid; place-items: center; color: var(--hz-t3); }
.hz-row__icon--empty .v-icon { font-size: 17px !important; }
.hz-row__text { min-width: 0; flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.hz-row__text b { font: 600 13px var(--hz-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-row__text small { font: 500 11px var(--hz-font); color: var(--hz-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-more { font: 500 11.5px var(--hz-font); color: var(--hz-t3); padding: 6px 8px 2px; }
.hz-empty-row { font: 500 12.5px var(--hz-font); color: var(--hz-t3); padding: 14px 8px; }
</style>
