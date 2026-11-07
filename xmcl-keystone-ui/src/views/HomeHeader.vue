<template>
  <div
    class="header hz-header sticky max-w-full select-none"
    :class="{ compact }"
    @wheel.stop
  >
    <div class="hz-header__inner" :style="{ opacity: dragover ? 0 : '' }">
      <div class="hz-header__row">
        <img class="hz-header__icon" :src="favicon" draggable="false">
        <div class="hz-header__title">
          <h1 class="hz-h1 home-title">
            {{ name || `Minecraft ${version.minecraft}` }}
          </h1>
          <div class="hz-sub">
            Minecraft <b>{{ version.minecraft || '?' }}</b>
            <template v-if="version.fabricLoader">
              · Fabric {{ version.fabricLoader }}
            </template>
            <template v-if="horizonVersion">
              · Horizon {{ horizonVersion }}
            </template>
          </div>
        </div>
        <div class="flex-grow" />
        <router-view name="actions" v-slot="{ Component }">
          <component :is="Component" class="hz-header__actions flex-shrink-0" />
        </router-view>
        <HorizonPlayButton v-if="route.path !== '/'" />
      </div>
      <nav class="hz-seg hz-header__tabs" aria-label="Instance pages">
        <router-link
          v-for="tab of tabs"
          :key="tab.to"
          :to="tab.to"
          :class="{ on: isTab(tab.to) }"
          :data-testid="`tab-${tab.key}`"
        >
          <v-icon>{{ tab.icon }}</v-icon>
          {{ tab.label }}
        </router-link>
      </nav>
      <router-view name="extensions" v-slot="{ Component }">
        <component :is="Component" v-if="route.path !== '/'" class="hz-head-ext" />
      </router-view>
    </div>
    <div
      v-if="dragover"
      class="w-full h-full flex top-0 p-5"
      style="position: absolute;"
      @dragenter="overcount++"
      @dragleave="overcount--"
      @drop="overcount = 0; onDropModpack($event)"
    >
      <Hint
        :text="t('modpack.dropHint')"
        icon="save_alt"
        class="rounded transition-all"
        :class="{ dragover }"
      />
    </div>
  </div>
</template>

<script lang=ts setup>
import Hint from '@/components/Hint.vue'
import { useDialog } from '@/composables/dialog'
import { kDropHandler } from '@/composables/dropHandler'
import { kInstance } from '@/composables/instance'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kCompact } from '@/composables/scrollTop'
import { injection } from '@/util/inject'
import { kInstanceModsContext } from '@/composables/instanceMods'
import { getInstanceIcon } from '@/util/favicon'
import HorizonPlayButton from './HorizonPlayButton.vue'

/**
 * Horizon Client: the instance header. Icon, name and versions, XMCL's page actions, the Play button, and a tab
 * bar for the instance pages (XMCL had no tabs: it reached them from cards on the home page).
 */
const { name, runtime: version, instance } = injection(kInstance)
const { t } = useI18n()
const route = useRoute()
const { mods } = injection(kInstanceModsContext)

const favicon = computed(() => getInstanceIcon(instance.value, undefined))
const horizonVersion = computed(() => mods.value.find(m => m.modId === 'horizon')?.version ?? '')

const tabs = [
  { key: 'overview', to: '/', icon: 'space_dashboard', label: 'Overview' },
  { key: 'mods', to: '/mods', icon: 'extension', label: 'Mods' },
  { key: 'worlds', to: '/save', icon: 'public', label: 'Worlds' },
  { key: 'resourcepacks', to: '/resourcepacks', icon: 'palette', label: 'Resource packs' },
  { key: 'shaders', to: '/shaderpacks', icon: 'wb_sunny', label: 'Shaders' },
  { key: 'settings', to: '/base-setting', icon: 'tune', label: 'Settings' },
]
function isTab(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

const transitioning = ref(false)
provide('transitioning', transitioning)

const compact = injection(kCompact)

const { dragover } = injection(kDropHandler)
const { show } = useDialog(AddInstanceDialogKey)
const onDropModpack = (e: DragEvent) => {
  e.preventDefault()
  const file = e.dataTransfer?.files.item(0)
  if (file) {
    const filePath = windowController.getPathForFile(file)
    if (!filePath) return
    show({
      format: 'modpack',
      path: filePath,
    })
  }
}

const overcount = ref(0)
</script>
<style scoped>
.hz-header {
  padding: 26px 28px 14px;
  z-index: 20;
}
.hz-header::before {
  content: '';
  position: absolute;
  inset: 0;
  bottom: -24px;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(#0b0b0e 55%, transparent);
  -webkit-mask-image: linear-gradient(black 60%, transparent);
  mask-image: linear-gradient(black 60%, transparent);
}
.hz-header__inner { display: flex; flex-direction: column; gap: 16px; }
.hz-header__row { display: flex; align-items: center; gap: 14px; min-width: 0; }
.hz-header__icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  flex: none;
  image-rendering: pixelated;
  background: var(--hz-fill2);
  box-shadow: inset 0 0 0 1px var(--hz-line);
}
.hz-header__title { min-width: 0; }
.hz-header__title h1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hz-header__actions :deep(.v-btn) { color: var(--hz-t3); }
.hz-header__actions :deep(.v-btn:hover) { color: var(--hz-t1); }
.hz-header__tabs { align-self: flex-start; }
.hz-header.compact { padding-top: 12px; }
.hz-header.compact .hz-header__icon { width: 36px; height: 36px; border-radius: 10px; }
.hz-header.compact .hz-h1 { font-size: 20px; }
.hz-header.compact .hz-sub { display: none; }
@media (max-width: 900px) {
  .hz-header { padding-left: 16px; padding-right: 16px; }
}
</style>
