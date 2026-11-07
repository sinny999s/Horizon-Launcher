<template>
  <div class="hz-play-wrap">
    <HomeLaunchButtonStatus :active="false" class="hz-play-status" />
    <button
      id="launch-button"
      data-testid="launch-button"
      type="button"
      class="hz-play"
      :class="{ big, busy: loading }"
      :disabled="isValidating"
      :aria-label="text"
      @click="onClick()"
    >
      <v-progress-circular
        v-if="loading"
        indeterminate
        :size="big ? 20 : 16"
        :width="2"
      />
      <v-icon v-else class="hz-play__ico">
        {{ leftIcon || icon || 'play_arrow' }}
      </v-icon>
      <span>{{ text }}</span>
      <span v-if="count" class="hz-play__count">{{ count }}</span>
    </button>
  </div>
</template>

<script lang="ts" setup>
/**
 * Horizon Client: the Play button. XMCL's launch logic (kLaunchButton: install, launch, kill, fix Java...)
 * behind a plain Horizon pill. `big` is the Overview's hero size.
 */
import { kLaunchButton } from '@/composables/launchButton'
import { kInstances } from '@/composables/instances'
import { injection } from '@/util/inject'
import HomeLaunchButtonStatus from './HomeLaunchButtonStatus.vue'

defineProps<{ big?: boolean }>()
const { isValidating } = injection(kInstances)
const { onClick, icon, text, loading, leftIcon, count } = injection(kLaunchButton)
</script>

<style scoped>
.hz-play-wrap { display: flex; align-items: center; gap: 14px; }
.hz-play {
  appearance: none;
  border: 0;
  cursor: pointer;
  height: 40px;
  padding: 0 22px 0 16px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font: 700 14px var(--hz-font);
  letter-spacing: .01em;
  background: linear-gradient(135deg, var(--hz-a1), var(--hz-a2) 60%, #d92f2f);
  box-shadow: 0 8px 24px -10px var(--hz-glow), inset 0 1px 0 rgba(255, 255, 255, .22);
  transition: transform .35s var(--hz-expo), box-shadow .35s, filter .25s;
}
.hz-play:hover { transform: translateY(-1px); filter: brightness(1.07); box-shadow: 0 12px 30px -10px rgba(244, 56, 56, .65), inset 0 1px 0 rgba(255, 255, 255, .25); }
.hz-play:active { transform: translateY(0) scale(.98); }
.hz-play:disabled { filter: saturate(.4) brightness(.7); cursor: default; }
.hz-play__ico { font-size: 20px !important; color: #fff; }
.hz-play.big { height: 52px; padding: 0 30px 0 22px; border-radius: 15px; font-size: 16.5px; gap: 10px; }
.hz-play.big .hz-play__ico { font-size: 26px !important; }
.hz-play__count { font: 700 10.5px var(--hz-font); padding: 1px 6px; border-radius: 6px; background: rgba(0, 0, 0, .25); }
.hz-play-status { font-family: var(--hz-font); }
</style>
