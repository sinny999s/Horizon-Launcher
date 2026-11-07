<template>
  <div
    v-context-menu="getItems"
    data-testid="instance-item"
    class="hz-inst non-moveable"
    :class="{ active: isActive, running: isRunning(path), launching: isLaunching(path) }"
    role="button"
    tabindex="0"
    :aria-label="name"
    :aria-pressed="isActive"
    @click="navigate"
    @dblclick="launch"
    @keydown.enter.prevent="navigate"
    @keydown.space.prevent="navigate"
  >
    <img class="hz-inst__icon" :src="favicon" draggable="false">
    <span class="hz-inst__text">
      <b>{{ name }}</b>
      <small>{{ subtitle }}</small>
    </span>
    <v-progress-circular
      v-if="isLaunching(path)"
      class="hz-inst__state"
      indeterminate
      :size="14"
      :width="2"
    />
    <span v-else-if="isRunning(path)" class="hz-inst__state hz-inst__dot" />
  </div>
</template>

<script lang="ts" setup>
/**
 * Horizon Client: one instance row of the sidebar (icon, name, Minecraft and Fabric version), in the style of
 * the Horizon ClickGUI's module list. Click selects it, double click launches it, right click opens XMCL's
 * instance menu.
 */
import { kInstance } from '@/composables/instance'
import { useInstanceContextMenuItems } from '@/composables/instanceContextMenu'
import { kInstanceLaunchCoordinator } from '@/composables/instanceLaunchCoordinator'
import { kLaunchButton } from '@/composables/launchButton'
import { kInstances } from '@/composables/instances'
import { vContextMenu } from '@/directives/contextMenu'
import { getInstanceIcon } from '@/util/favicon'
import { injection } from '@/util/inject'
import { useInstanceServerStatus } from '../composables/serverStatus'

const props = defineProps<{ path: string }>()

const { instances, selectedInstance } = injection(kInstances)
const { isLaunching, isRunning } = injection(kInstanceLaunchCoordinator)
const { onClick: onLaunchClick } = injection(kLaunchButton)
const { select } = injection(kInstance)
const instance = computed(() => instances.value.find((i) => i.path === props.path))

const name = computed(() => {
  const inst = instance.value
  if (!inst) return ''
  return inst.name || (inst.runtime.minecraft ? `Minecraft ${inst.runtime.minecraft}` : '')
})
const subtitle = computed(() => {
  const rt = instance.value?.runtime
  if (!rt) return ''
  return [rt.minecraft, rt.fabricLoader ? `Fabric ${rt.fabricLoader}` : ''].filter(Boolean).join(' · ')
})

const { status } = useInstanceServerStatus(instance)
const favicon = computed(() => {
  const inst = instance.value
  if (!inst) return ''
  return getInstanceIcon(inst, inst.server ? status.value : undefined)
})

const getItems = useInstanceContextMenuItems(instance)

const route = useRoute()
const router = useRouter()
const isActive = computed(() => props.path === selectedInstance.value && route.matched[0]?.path === '/')

function navigate() {
  if (router.currentRoute.value.path !== '/') {
    router.push('/').then(() => select(props.path))
  } else {
    select(props.path)
  }
}

function launch() {
  if (selectedInstance.value !== props.path) select(props.path)
  nextTick(() => onLaunchClick())
}
</script>

<style scoped>
.hz-inst {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 10px 0 7px;
  border-radius: 11px;
  cursor: pointer;
  color: var(--hz-t2);
  transition: background .25s, color .25s;
}
.hz-inst:hover { background: var(--hz-fill); color: var(--hz-t1); }
.hz-inst.active {
  color: #fff;
  background: linear-gradient(90deg, rgba(255, 255, 255, .085), rgba(255, 255, 255, .035));
  box-shadow: inset 0 0 0 1px var(--hz-line);
}
.hz-inst__icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  flex: none;
  object-fit: cover;
  image-rendering: pixelated;
  background: var(--hz-fill2);
}
.hz-inst__text { min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.hz-inst__text b {
  font: 600 13px var(--hz-font);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hz-inst__text small {
  font: 500 11px var(--hz-font);
  color: var(--hz-t3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.hz-inst__state { margin-left: auto; flex: none; }
.hz-inst__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34d77b;
  box-shadow: 0 0 8px rgba(52, 215, 123, .6);
}
</style>
