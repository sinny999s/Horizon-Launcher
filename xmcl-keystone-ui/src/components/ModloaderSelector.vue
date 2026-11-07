<template>
  <div>
    <!--
      Horizon Client: Fabric is the only mod loader, so there's no loader choice to make. Vanilla, Forge,
      NeoForge, Quilt, OptiFine, LabyMod and local versions are not offered. The Minecraft list only has
      releases from 26.3 on that Fabric supports (see filterHorizonMinecraftVersions).
    -->
    <div data-testid="modloader-tab-fabric" class="hz-create-note">
      <img :src="BuiltinImages.fabric" width="22" height="22">
      <span><b>Fabric</b> with Horizon, Fabric API and Fabric Language Kotlin, added for you.</span>
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
