<template>
  <section class="about">
    <!--
      Horizon Client: Horizon's About. XMCL's account panel, donate badges, contributor wall and sponsor logos are
      gone (they belong to XMCL's own project); the credit and its MIT licence stay.
    -->
    <div class="hz-card hz-about">
      <div class="hz-about__head">
        <span class="hz-about__mark" role="img" aria-label="Horizon" />
        <div>
          <div class="hz-h2">
            Horizon Client <span class="hz-chip">{{ version }}</span>
          </div>
          <div class="hz-sub">
            Based on
            <a href="https://github.com/Voxelum/x-minecraft-launcher" target="_blank">X Minecraft Launcher</a>
            by ci010 and contributors, MIT licence.
          </div>
        </div>
      </div>
      <p class="hz-about__legal">
        Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
      </p>
      <details class="hz-about__debug">
        <summary>System info (for bug reports)</summary>
        <pre><code>{{ debugInfo }}</code></pre>
      </details>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { kEnvironment } from '@/composables/environment'
import { kFlights } from '@/composables/flights'
import { injection } from '@/util/inject'

const env = injection(kEnvironment)
const flights = injection(kFlights)

const debugInfo = computed(() => JSON.stringify({ ...env.value, flights }, null, 2))
const version = computed(() => env.value?.version ?? '')
</script>

<style scoped>
.hz-about { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.hz-about__head { display: flex; align-items: center; gap: 16px; }
.hz-about__mark {
  width: 120px;
  height: 28px;
  flex: none;
  background: #fff;
  -webkit-mask: url('@/assets/horizon/wordmark.svg') center / contain no-repeat;
  mask: url('@/assets/horizon/wordmark.svg') center / contain no-repeat;
}
.hz-about .hz-h2 { display: flex; align-items: center; gap: 8px; }
.hz-about a { color: var(--hz-t2); text-decoration: underline; text-underline-offset: 2px; }
.hz-about a:hover { color: var(--hz-t1); }
.hz-about__legal { margin: 0; font: 500 11.5px var(--hz-font); color: var(--hz-t3); }
.hz-about__debug summary { cursor: pointer; font: 600 12px var(--hz-font); color: var(--hz-t3); }
.hz-about__debug summary:hover { color: var(--hz-t1); }
.hz-about__debug pre {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 11px;
  background: rgba(0, 0, 0, .3);
  border: 1px solid var(--hz-line);
  font: 11px/1.45 ui-monospace, Consolas, monospace;
  color: var(--hz-t2);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow: auto;
  user-select: text;
}
</style>
