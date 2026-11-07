<template>
  <div>
    <!--
      Horizon Client: Fabric is the only mod loader, so there's no loader choice to make. Vanilla, Forge,
      NeoForge, Quilt, OptiFine, LabyMod and local versions are not offered. The Minecraft list only has
      releases from 26.3 on that Fabric supports (see filterHorizonMinecraftVersions).
    -->
    <div class="text-sm font-bold opacity-70 my-4">{{ t('modrinth.categories.modloader') }}</div>
    <div class="flex flex-wrap gap-3 mb-6 items-center justify-center">
      <v-card
        data-testid="modloader-tab-fabric"
        variant="outlined"
        color="primary"
        class="flex-1 min-w-[80px] max-w-[120px] flex flex-col items-center justify-center py-4 border-2"
        :style="{ borderColor: 'rgba(var(--v-theme-primary), 1)' }"
      >
        <img :src="BuiltinImages.fabric" width="36" height="36" class="mb-2" />
        <span class="text-xs font-semibold">Fabric</span>
      </v-card>
    </div>

    <VersionInputMinecraft
      v-if="showMinecraft"
      data-testid="version-input-minecraft"
      class="mb-4"
      :value="data.runtime.minecraft"
      :versions="versions"
      @input="onSelectMinecraft"
    />
    <VersionInputFabric
      data-testid="version-input-fabric"
      :value="data.runtime.fabricLoader"
      :minecraft="data.runtime.minecraft"
      :versions="versions"
      :auto-select-latest="true"
      @input="onSelectFabric"
    />
  </div>
</template>

<script lang=ts setup>
import VersionInputFabric from '@/components/VersionInputFabric.vue'
import VersionInputMinecraft from '@/components/VersionInputMinecraft.vue'
import { useInstanceEditVersions } from '@/composables/instanceEdit'
import { BuiltinImages } from '@/constant'
import { VersionHeader } from '@xmcl/runtime-api'
import type { InstanceData } from '@xmcl/instance'
import { toRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  data: Pick<InstanceData, 'runtime' | 'version'>
  versions: VersionHeader[]
  showMinecraft?: boolean
  /** Kept for callers; local versions are not offered in Horizon Client. */
  showLocal?: boolean
  localPlaceholder?: string
  autoSelectLatestOnClick?: boolean
}>(), {
  showMinecraft: true,
  showLocal: false,
  localPlaceholder: undefined,
  autoSelectLatestOnClick: false,
})

const { t } = useI18n()

const versions = toRef(props, 'versions')

const { onSelectMinecraft, onSelectFabric } = useInstanceEditVersions(props.data, versions)

// Anything other than Fabric (an imported or old instance) is cleared, so the instance runs on Fabric.
watch(() => props.data.runtime, (rt) => {
  if (rt.forge || rt.neoForged || rt.quiltLoader || rt.optifine || rt.labyMod || props.data.version) {
    rt.forge = ''
    rt.neoForged = ''
    rt.quiltLoader = ''
    rt.optifine = ''
    rt.labyMod = ''
    props.data.version = ''
  }
}, { deep: true, immediate: true })
</script>
