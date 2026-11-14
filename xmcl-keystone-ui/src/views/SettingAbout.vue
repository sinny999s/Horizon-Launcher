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
      <div class="hz-about__update" data-testid="launcher-update-about">
        <v-icon class="hz-about__update-ico" :class="stage" :size="20">
          {{ updateText.icon }}
        </v-icon>
        <div class="hz-about__update-text">
          <b>{{ updateText.title }}</b>
          <small>{{ updateText.sub }}</small>
        </div>
        <button v-if="stage === 'ready'" type="button" class="hz-btn red" :disabled="busy" @click="act()">
          Restart to update
        </button>
        <button v-else-if="stage === 'download'" type="button" class="hz-btn" :disabled="busy" @click="act()">
          Download
        </button>
        <button v-else-if="stage === 'manual'" type="button" class="hz-btn" @click="act()">
          Open download page
        </button>
        <button v-else-if="stage === 'none'" type="button" class="hz-btn" :disabled="checking" @click="check()">
          {{ checking ? 'Checking…' : 'Check for updates' }}
        </button>
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
import { useHorizonUpdate } from '@/composables/horizonUpdate'
import { injection } from '@/util/inject'

const env = injection(kEnvironment)
const flights = injection(kFlights)

const debugInfo = computed(() => JSON.stringify({ ...env.value, flights }, null, 2))
const version = computed(() => env.value?.version ?? '')

// The launcher's own update (from the GitHub releases of sinny999s/Horizon-Launcher).
const { stage, version: newVersion, checked, percent, busy, checking, error, act, check } = useHorizonUpdate()
const updateText = computed(() => {
  const v = newVersion.value
  if (error.value) return { icon: 'error_outline', title: 'Couldn\'t check for updates', sub: error.value }
  switch (stage.value) {
    case 'ready': return { icon: 'restart_alt', title: `Version ${v} is ready`, sub: 'Restart now, or it installs when you close the launcher.' }
    case 'downloading': return { icon: 'downloading', title: `Downloading version ${v}`, sub: `${percent.value}%. It installs when you restart or close the launcher.` }
    case 'download': return { icon: 'system_update_alt', title: `Version ${v} is available`, sub: 'Download it now; it installs when you restart.' }
    case 'manual': return { icon: 'open_in_new', title: `Version ${v} is available`, sub: 'This copy can\'t update itself. Get the new version from the releases page.' }
    default: return checked.value
      ? { icon: 'check_circle', title: 'Up to date', sub: `Horizon Client ${version.value} is the newest version.` }
      : { icon: 'update', title: 'Updates', sub: 'Checked when the launcher starts and every few hours. Updates install by themselves.' }
  }
})
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
.hz-about__update {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--hz-fill);
  border: 1px solid var(--hz-line);
}
.hz-about__update-ico { flex: none; color: var(--hz-t2); }
.hz-about__update-ico.ready { color: #ff9a9a; }
.hz-about__update-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.hz-about__update-text b { font: 600 13px var(--hz-font); color: var(--hz-t1); }
.hz-about__update-text small { font: 500 11.5px var(--hz-font); color: var(--hz-t3); overflow-wrap: anywhere; }
.hz-about__update .hz-btn { flex: none; }
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
