<template>
  <div class="hz-page hz-content">
    <div class="hz-content__bar">
      <div class="hz-seg">
        <button type="button" :class="{ on: view === 'installed' }" data-testid="content-installed" @click="view = 'installed'">
          <v-icon>inventory_2</v-icon>
          Installed
          <span class="hz-count">{{ installed.length }}</span>
        </button>
        <button type="button" :class="{ on: view === 'browse' }" data-testid="content-browse" @click="view = 'browse'">
          <v-icon>travel_explore</v-icon>
          Browse Modrinth
        </button>
      </div>
      <div v-if="view === 'installed'" class="hz-seg">
        <button v-for="f of filters" :key="f.key" type="button" :class="{ on: filter === f.key }" @click="filter = f.key">
          {{ f.label }}
        </button>
      </div>
      <div class="flex-grow" />
      <label class="hz-search hz-content__search">
        <v-icon>search</v-icon>
        <input v-model="keyword" :placeholder="view === 'installed' ? `Search ${kindName.toLowerCase()}` : `Search Modrinth ${kindName.toLowerCase()} for ${runtime.minecraft}`" spellcheck="false">
      </label>
      <router-link
        v-if="view === 'installed'"
        :to="classicPath"
        class="hz-btn ghost"
        title="XMCL's page: updates, dependency checks, folders"
      >
        <v-icon>build</v-icon>
        Tools
      </router-link>
      <button v-if="view === 'installed'" type="button" class="hz-btn hz-icon-btn" title="Open folder" @click="openFolder">
        <v-icon>folder_open</v-icon>
      </button>
    </div>

    <!-- Installed -->
    <template v-if="view === 'installed'">
      <div v-if="shownInstalled.length === 0" class="hz-content__empty">
        <v-icon>{{ kindIcon }}</v-icon>
        <p>{{ installed.length === 0 ? `No ${kindName.toLowerCase()} installed yet.` : 'Nothing matches.' }}</p>
        <button v-if="installed.length === 0" type="button" class="hz-btn red" @click="view = 'browse'">
          Browse Modrinth
        </button>
      </div>
      <div v-else class="hz-content__grid">
        <div
          v-for="item of shownInstalled"
          :key="item.key"
          class="hz-card hz-item"
          :class="{ on: item.enabled }"
          @click="toggle(item)"
        >
          <div class="hz-item__top">
            <img v-if="item.icon" :src="item.icon" class="hz-item__icon" draggable="false">
            <span v-else class="hz-item__icon hz-item__icon--empty"><v-icon>{{ kindIcon }}</v-icon></span>
            <div class="hz-item__name">
              <b>{{ item.name }}</b>
              <small>{{ item.version || item.fileName }}</small>
            </div>
            <button
              type="button"
              class="hz-toggle"
              :class="{ on: item.enabled }"
              :aria-label="item.enabled ? 'Turn off' : 'Turn on'"
              @click.stop="toggle(item)"
            />
          </div>
          <p class="hz-item__desc">
            {{ item.description || item.fileName }}
          </p>
          <div class="hz-item__foot">
            <span v-if="item.isHorizon" class="hz-chip red">Horizon</span>
            <span v-else-if="item.modrinth" class="hz-chip">Modrinth</span>
            <div class="flex-grow" />
            <button type="button" class="hz-mini" title="Show file" @click.stop="showFile(item)">
              <v-icon>folder</v-icon>
            </button>
            <button
              type="button"
              class="hz-mini"
              :class="{ danger: confirmDelete === item.key }"
              :title="confirmDelete === item.key ? 'Click again to delete' : 'Delete'"
              @click.stop="remove(item)"
            >
              <v-icon>{{ confirmDelete === item.key ? 'delete_forever' : 'delete' }}</v-icon>
              <span v-if="confirmDelete === item.key">Delete?</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Browse -->
    <template v-else>
      <div v-if="searchError" class="hz-content__empty">
        <v-icon>wifi_off</v-icon>
        <p>Couldn't reach Modrinth: {{ searchError }}</p>
      </div>
      <div v-else class="hz-content__grid">
        <div
          v-for="hit of hits"
          :key="hit.project_id"
          class="hz-card hz-item hz-item--browse"
        >
          <div class="hz-item__top">
            <img v-if="hit.icon_url" :src="hit.icon_url" class="hz-item__icon" draggable="false">
            <span v-else class="hz-item__icon hz-item__icon--empty"><v-icon>{{ kindIcon }}</v-icon></span>
            <div class="hz-item__name">
              <b>{{ hit.title }}</b>
              <small>by {{ hit.author }} · {{ compact(hit.downloads) }} downloads</small>
            </div>
          </div>
          <p class="hz-item__desc">
            {{ hit.description }}
          </p>
          <div class="hz-item__foot">
            <span v-for="c of chips(hit)" :key="c" class="hz-chip">{{ c }}</span>
            <div class="flex-grow" />
            <span v-if="isInstalled(hit.project_id)" class="hz-chip green">
              <v-icon :size="12">check</v-icon>
              Installed
            </span>
            <button
              v-else
              type="button"
              class="hz-btn red hz-item__install"
              :disabled="installing.has(hit.project_id)"
              @click="install(hit)"
            >
              <v-progress-circular v-if="installing.has(hit.project_id)" indeterminate :size="14" :width="2" />
              <v-icon v-else>download</v-icon>
              Install
            </button>
          </div>
        </div>
      </div>
      <div v-if="searching" class="hz-content__more">
        <v-progress-circular indeterminate :size="20" :width="2" />
      </div>
      <div v-else-if="hits.length < total" class="hz-content__more">
        <button type="button" class="hz-btn" @click="search(hits.length)">
          Load more
        </button>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
/**
 * Horizon Client: the Mods, Resource packs and Shaders tabs, replacing XMCL's market-and-filter pages. "Installed"
 * shows the instance's files as Horizon module cards (click or the toggle turns one on or off), "Browse Modrinth"
 * searches Modrinth for this Minecraft version (Fabric mods only) and installs with dependencies through XMCL's
 * installer.
 */
import { useCurseforgeInstaller } from '@/composables/curseforgeInstaller'
import { kInstance } from '@/composables/instance'
import { kInstanceModsContext } from '@/composables/instanceMods'
import { kInstanceResourcePacks } from '@/composables/instanceResourcePack'
import { kInstanceShaderPacks } from '@/composables/instanceShaderPack'
import { getFacatsText } from '@/composables/modrinth'
import { useModrinthInstaller } from '@/composables/modrinthInstaller'
import { useNotifier } from '@/composables/notifier'
import { useProjectInstall } from '@/composables/projectInstall'
import { useService } from '@/composables/service'
import { clientModrinthV2 } from '@/util/clients'
import { injection } from '@/util/inject'
import type { ProjectEntry, ProjectFile } from '@/util/search'
import { BaseServiceKey, InstanceModsServiceKey, InstanceResourcePacksServiceKey, InstanceShaderPacksServiceKey } from '@xmcl/runtime-api'
import { useDebounceFn } from '@vueuse/core'

const props = defineProps<{ kind: 'mod' | 'resourcepack' | 'shader' }>()

const { notify } = useNotifier()
const { path, runtime } = injection(kInstance)
const modsCtx = injection(kInstanceModsContext)
const packs = injection(kInstanceResourcePacks)
const shaders = injection(kInstanceShaderPacks)
const { showItemInDirectory } = useService(BaseServiceKey)
const modService = useService(InstanceModsServiceKey)
const packService = useService(InstanceResourcePacksServiceKey)
const shaderService = useService(InstanceShaderPacksServiceKey)

const kindName = computed(() => props.kind === 'mod' ? 'Mods' : props.kind === 'resourcepack' ? 'Resource packs' : 'Shaders')
const kindIcon = computed(() => props.kind === 'mod' ? 'extension' : props.kind === 'resourcepack' ? 'palette' : 'wb_sunny')
const service = computed(() => props.kind === 'mod' ? modService : props.kind === 'resourcepack' ? packService : shaderService)

const view = ref<'installed' | 'browse'>('installed')

// XMCL's page for this tab (updates, dependency checks...). Links that open a project in it (`?id=modrinth:...`,
// from the command palette or a Modrinth link) go straight there.
const route = useRoute()
const router = useRouter()
const classicPath = computed(() => (props.kind === 'mod' ? '/mods' : props.kind === 'resourcepack' ? '/resourcepacks' : '/shaderpacks') + '-classic')
// The sidebar's "Browse mods" opens this tab on Modrinth.
watch(() => route.query.browse, (b) => { if (b === '1') view.value = 'browse' }, { immediate: true })
watch(view, (v) => { if (v === 'installed' && route.query.browse) router.replace({ path: route.path }) })
watch(() => route.query.id, (id) => {
  if (id) router.replace({ path: classicPath.value, query: route.query })
}, { immediate: true })
const keyword = ref('')
const filter = ref<'all' | 'on' | 'off'>('all')
const filters = computed(() => [
  { key: 'all' as const, label: 'All' },
  { key: 'on' as const, label: props.kind === 'shader' ? 'In use' : 'On' },
  { key: 'off' as const, label: 'Off' },
])

interface Item {
  key: string
  name: string
  version: string
  description: string
  icon: string
  enabled: boolean
  path: string
  fileName: string
  isHorizon: boolean
  modrinth?: { projectId: string }
  raw: any
}

const files = computed<ProjectFile[]>(() => props.kind === 'mod'
  ? modsCtx.mods.value as any
  : props.kind === 'resourcepack' ? packs.files.value as any : shaders.shaderPacks.value as any)

const installed = computed<Item[]>(() => {
  if (props.kind === 'mod') {
    return modsCtx.mods.value.map(m => ({
      key: m.path, name: m.name || m.fileName, version: m.version, description: m.description, icon: m.icon,
      enabled: m.enabled, path: m.path, fileName: m.fileName, isHorizon: m.modId === 'horizon', modrinth: m.modrinth, raw: m,
    }))
  }
  if (props.kind === 'resourcepack') {
    return packs.files.value.filter(p => p.id !== 'vanilla' && p.path).map(p => ({
      key: p.path, name: p.name || p.fileName, version: p.version, description: typeof p.description === 'string' ? p.description : '',
      icon: p.icon, enabled: p.enabled, path: p.path, fileName: p.fileName, isHorizon: false, modrinth: (p as any).modrinth, raw: p,
    }))
  }
  return shaders.shaderPacks.value.map((s: any) => ({
    key: s.path, name: s.name || s.fileName, version: s.version, description: s.description || '', icon: s.icon || '',
    enabled: s.enabled, path: s.path, fileName: s.fileName, isHorizon: false, modrinth: s.modrinth, raw: s,
  }))
})

const shownInstalled = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return installed.value
    .filter(i => filter.value === 'all' || (filter.value === 'on') === i.enabled)
    .filter(i => !k || i.name.toLowerCase().includes(k) || i.fileName.toLowerCase().includes(k))
    .sort((a, b) => Number(b.isHorizon) - Number(a.isHorizon) || Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
})

async function toggle(item: Item) {
  try {
    if (props.kind === 'mod') {
      await (item.enabled ? modsCtx.disable : modsCtx.enable)({ path: path.value, files: [item.path] })
    } else if (props.kind === 'resourcepack') {
      await (item.enabled ? packs.disable([item.raw]) : packs.enable([item.raw]))
    } else {
      shaders.shaderPack.value = item.enabled ? '' : item.fileName
    }
  } catch (e) {
    notify({ level: 'error', title: `Couldn't change ${item.name}`, body: String((e as any)?.message ?? e) })
  }
}

function showFile(item: Item) {
  showItemInDirectory(item.path)
}
function openFolder() {
  service.value.showDirectory(path.value)
}

const confirmDelete = ref('')
let confirmTimer: ReturnType<typeof setTimeout> | undefined
async function remove(item: Item) {
  if (confirmDelete.value !== item.key) {
    confirmDelete.value = item.key
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmDelete.value = '' }, 3000)
    return
  }
  confirmDelete.value = ''
  try {
    await service.value.uninstall({ path: path.value, files: [item.path] })
  } catch (e) {
    notify({ level: 'error', title: `Couldn't delete ${item.name}`, body: String((e as any)?.message ?? e) })
  }
}

// ── Browse Modrinth ──
interface Hit { project_id: string; title: string; description: string; icon_url?: string; author: string; downloads: number; display_categories?: string[] }
const hits = shallowRef<Hit[]>([])
const total = ref(0)
const searching = ref(false)
const searchError = ref('')
let searchSeq = 0

async function search(offset = 0) {
  const seq = ++searchSeq
  searching.value = true
  searchError.value = ''
  try {
    const projectType = props.kind === 'mod' ? 'mod' : props.kind === 'resourcepack' ? 'resourcepack' : 'shader'
    const facets = getFacatsText(runtime.value.minecraft, '', [], props.kind === 'mod' ? ['fabric'] : [], projectType, '')
    const result = await clientModrinthV2.searchProjects({
      query: keyword.value.trim(),
      limit: 24,
      offset,
      index: keyword.value.trim() ? 'relevance' : 'downloads',
      facets,
    })
    if (seq !== searchSeq) return
    hits.value = offset === 0 ? result.hits as any : [...hits.value, ...result.hits as any]
    total.value = result.total_hits
  } catch (e) {
    if (seq === searchSeq) searchError.value = String((e as any)?.message ?? e)
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}
const searchSoon = useDebounceFn(() => search(0), 350)
watch(keyword, () => { if (view.value === 'browse') searchSoon() })
watch(view, (v) => { if (v === 'browse' && hits.value.length === 0) search(0) })
watch(() => props.kind, () => { hits.value = []; total.value = 0; keyword.value = ''; if (view.value === 'browse') search(0) })
watch(() => runtime.value.minecraft, () => { if (view.value === 'browse') search(0) })
// Opened straight into Browse (the sidebar's "Browse mods"): the view watcher above wasn't there yet.
if (view.value === 'browse') search(0)

const installedProjectIds = computed(() => new Set(installed.value.flatMap(i => i.modrinth?.projectId ? [i.modrinth.projectId] : [])))
const justInstalled = ref(new Set<string>())
function isInstalled(id: string) {
  return installedProjectIds.value.has(id) || justInstalled.value.has(id)
}

const loader = computed(() => props.kind === 'mod' ? 'fabric' : undefined)
const resolveFromMarket = (o: any) => service.value.resolveFromMarket(o)
const modrinthInstaller = useModrinthInstaller(path, runtime, files, resolveFromMarket)
const curseforgeInstaller = useCurseforgeInstaller(path, runtime, files, resolveFromMarket)
const installProject = useProjectInstall(runtime, loader, curseforgeInstaller, modrinthInstaller, (file) => {
  void service.value.install({ path: path.value, files: [file.path] })
})

const installing = ref(new Set<string>())
async function install(hit: Hit) {
  if (installing.value.has(hit.project_id)) return
  installing.value = new Set(installing.value).add(hit.project_id)
  try {
    const entry: ProjectEntry = {
      id: hit.project_id,
      icon: hit.icon_url ?? '',
      title: hit.title,
      description: hit.description,
      author: hit.author,
      installed: [],
      modrinth: { project_id: hit.project_id } as any,
    }
    await installProject(entry)
    justInstalled.value = new Set(justInstalled.value).add(hit.project_id)
  } catch (e) {
    notify({ level: 'error', title: `Couldn't install ${hit.title}`, body: String((e as any)?.message ?? e) })
  } finally {
    const next = new Set(installing.value)
    next.delete(hit.project_id)
    installing.value = next
  }
}

/** Modrinth's categories without the loader names (every result here is for Fabric anyway). */
const LOADERS = new Set(['fabric', 'forge', 'neoforge', 'quilt', 'babric', 'liteloader', 'rift', 'modloader', 'iris', 'optifine', 'canvas', 'vanilla', 'minecraft', 'datapack', 'bukkit', 'paper', 'spigot', 'folia', 'velocity'])
function chips(hit: Hit) {
  return (hit.display_categories ?? []).filter(c => !LOADERS.has(c)).slice(0, 2)
}

const fmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
function compact(n: number) {
  return fmt.format(n || 0)
}
</script>

<style scoped>
.hz-content { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
.hz-content__bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hz-content__search { width: 300px; max-width: 100%; }
.hz-count { font: 600 10.5px var(--hz-font); color: var(--hz-t3); padding: 1px 6px; border-radius: 6px; background: var(--hz-fill); font-variant-numeric: tabular-nums; }

.hz-content__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }

.hz-item { cursor: pointer; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 10px; }
.hz-item:hover { background: rgba(255, 255, 255, .05); border-color: rgba(255, 255, 255, .12); transform: translateY(-2px); }
.hz-item.on:hover { border-color: rgba(244, 56, 56, .42); }
.hz-item--browse { cursor: default; }
.hz-item__top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.hz-item__icon { width: 34px; height: 34px; border-radius: 9px; flex: none; object-fit: cover; background: var(--hz-fill2); }
.hz-item__icon--empty { display: grid; place-items: center; color: var(--hz-t3); }
.hz-item__name { min-width: 0; flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.hz-item__name b { font: 600 14px var(--hz-font); letter-spacing: -.1px; color: rgba(245, 245, 247, .92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-item.on .hz-item__name b { color: #fff; }
.hz-item__name small { font: 500 11px var(--hz-font); color: var(--hz-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-item__desc {
  margin: 0;
  font: 400 12px/1.4 var(--hz-font);
  color: var(--hz-t3);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 2.8em;
}
.hz-item.on .hz-item__desc { color: var(--hz-t2); }
.hz-item__foot { display: flex; align-items: center; gap: 6px; min-height: 24px; }
.hz-item__install { height: 28px; padding: 0 11px; font-size: 12px; }

.hz-mini {
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  height: 24px;
  min-width: 24px;
  padding: 0 5px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--hz-t3);
  font: 600 11px var(--hz-font);
  opacity: 0;
  transition: opacity .2s, background .2s, color .2s;
}
.hz-mini .v-icon { font-size: 15px !important; }
.hz-item:hover .hz-mini, .hz-mini.danger { opacity: 1; }
.hz-mini:hover { background: var(--hz-fill2); color: var(--hz-t1); }
.hz-mini.danger { color: #ff8f8f; background: rgba(244, 56, 56, .14); }

.hz-content__empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 70px 0; color: var(--hz-t3); font: 500 13px var(--hz-font); }
.hz-content__empty .v-icon { font-size: 34px !important; opacity: .6; }
.hz-content__empty p { margin: 0; }
.hz-content__more { display: flex; justify-content: center; padding: 8px 0 4px; }
</style>
