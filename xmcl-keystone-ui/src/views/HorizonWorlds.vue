<template>
  <div class="hz-page hz-worlds">
    <div class="hz-worlds__bar">
      <span class="hz-label">{{ saves.length }} {{ saves.length === 1 ? 'world' : 'worlds' }}</span>
      <div class="flex-grow" />
      <label class="hz-search hz-worlds__search">
        <v-icon>search</v-icon>
        <input v-model="keyword" placeholder="Search worlds" spellcheck="false">
      </label>
      <router-link to="/save-classic" class="hz-btn ghost" title="XMCL's page: import, export, share, datapacks">
        <v-icon>build</v-icon>
        Tools
      </router-link>
      <button type="button" class="hz-btn hz-icon-btn" title="Open saves folder" @click="showDirectory(path)">
        <v-icon>folder_open</v-icon>
      </button>
    </div>

    <div v-if="shown.length === 0" class="hz-worlds__empty">
      <v-icon>public</v-icon>
      <p>{{ saves.length === 0 ? 'No singleplayer worlds yet. Create one in game.' : 'Nothing matches.' }}</p>
    </div>
    <div v-else class="hz-worlds__grid">
      <div v-for="s of shown" :key="s.path" class="hz-card hz-world">
        <div class="hz-world__art">
          <img v-if="s.icon" :src="s.icon" draggable="false">
          <v-icon v-else>public</v-icon>
          <span class="hz-chip hz-world__mode" :class="{ red: s.mode === 1 }">{{ modeName(s.mode) }}</span>
        </div>
        <div class="hz-world__body">
          <b>{{ s.levelName || s.name }}</b>
          <small>{{ s.name }} · {{ s.gameVersion || '?' }}</small>
          <small>Played {{ ago(s.lastPlayed) }}</small>
        </div>
        <div class="hz-world__actions">
          <button type="button" class="hz-mini" title="Show folder" @click="showItemInDirectory(s.path)">
            <v-icon>folder</v-icon>
          </button>
          <button type="button" class="hz-mini" title="Duplicate" @click="duplicateSave(s)">
            <v-icon>content_copy</v-icon>
          </button>
          <button
            type="button"
            class="hz-mini"
            :class="{ danger: confirmDelete === s.path }"
            :title="confirmDelete === s.path ? 'Click again to delete' : 'Delete'"
            @click="remove(s)"
          >
            <v-icon>{{ confirmDelete === s.path ? 'delete_forever' : 'delete' }}</v-icon>
            <span v-if="confirmDelete === s.path">Delete?</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
/**
 * Horizon Client: the Worlds tab, replacing XMCL's saves market page. The instance's singleplayer worlds as cards
 * (icon, name, mode, version, last played) with show folder, duplicate and delete. XMCL's page stays at
 * /save-classic for import, export, sharing and datapacks.
 */
import { kInstance } from '@/composables/instance'
import { kInstanceSave } from '@/composables/instanceSave'
import { useNotifier } from '@/composables/notifier'
import { useService } from '@/composables/service'
import { injection } from '@/util/inject'
import { BaseServiceKey, InstanceSavesServiceKey } from '@xmcl/runtime-api'

const { path } = injection(kInstance)
const { saves, deleteSave, duplicateSave } = injection(kInstanceSave)
const { showItemInDirectory } = useService(BaseServiceKey)
const { showDirectory } = useService(InstanceSavesServiceKey)
const { notify } = useNotifier()

const keyword = ref('')
const shown = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return [...saves.value]
    .filter(s => !k || (s.levelName || '').toLowerCase().includes(k) || s.name.toLowerCase().includes(k))
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
})

function modeName(mode: number | string) {
  const names: Record<string, string> = { 0: 'Survival', 1: 'Creative', 2: 'Adventure', 3: 'Spectator' }
  return names[String(mode)] ?? 'Survival'
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

const confirmDelete = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
async function remove(s: (typeof saves.value)[number]) {
  if (confirmDelete.value !== s.path) {
    confirmDelete.value = s.path
    clearTimeout(timer)
    timer = setTimeout(() => { confirmDelete.value = '' }, 3000)
    return
  }
  confirmDelete.value = ''
  try {
    await deleteSave(s)
  } catch (e) {
    notify({ level: 'error', title: `Couldn't delete ${s.levelName || s.name}`, body: String((e as any)?.message ?? e) })
  }
}
</script>

<style scoped>
.hz-worlds { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
.hz-worlds__bar { display: flex; align-items: center; gap: 10px; }
.hz-worlds__search { width: 280px; }
.hz-worlds__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.hz-world { padding: 0; display: flex; flex-direction: column; }
.hz-world:hover { background: rgba(255, 255, 255, .05); border-color: rgba(255, 255, 255, .12); transform: translateY(-2px); }
.hz-world__art {
  position: relative;
  height: 110px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, .3);
  border-bottom: 1px solid var(--hz-line);
  overflow: hidden;
}
.hz-world__art img { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; filter: saturate(1.05); }
.hz-world__art .v-icon { font-size: 40px !important; color: var(--hz-t4); }
.hz-world__mode { position: absolute; left: 10px; top: 10px; backdrop-filter: blur(8px); background: rgba(0, 0, 0, .45); }
.hz-world__body { padding: 11px 14px 4px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hz-world__body b { font: 600 14px var(--hz-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-world__body small { font: 500 11.5px var(--hz-font); color: var(--hz-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-world__actions { display: flex; gap: 2px; padding: 4px 8px 8px; justify-content: flex-end; }

.hz-mini {
  appearance: none; border: 0; background: none; cursor: pointer;
  height: 26px; min-width: 26px; padding: 0 6px; border-radius: 7px;
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--hz-t3); font: 600 11px var(--hz-font);
  transition: background .2s, color .2s;
}
.hz-mini .v-icon { font-size: 16px !important; }
.hz-mini:hover { background: var(--hz-fill2); color: var(--hz-t1); }
.hz-mini.danger { color: #ff8f8f; background: rgba(244, 56, 56, .14); }

.hz-worlds__empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 70px 0; color: var(--hz-t3); font: 500 13px var(--hz-font); }
.hz-worlds__empty .v-icon { font-size: 34px !important; opacity: .6; }
.hz-worlds__empty p { margin: 0; }
</style>
