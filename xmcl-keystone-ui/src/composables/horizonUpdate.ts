import { BaseServiceKey } from '@xmcl/runtime-api'
import { injection } from '@/util/inject'
import { kEnvironment } from './environment'
import { useService } from './service'
import { kSettingsState } from './setting'
import { useTask } from './task'

/**
 * Where the launcher's own update is:
 * - `none`: no newer version known.
 * - `downloading`: the installer is downloading (BaseService starts this as soon as it finds an update).
 * - `download`: found, but the download stopped; it can be started again.
 * - `manual`: this copy can't update itself (the portable exe); the download page opens instead.
 * - `ready`: downloaded. It installs on a restart, or when the launcher closes.
 */
export type HorizonUpdateStage = 'none' | 'downloading' | 'download' | 'manual' | 'ready'

/**
 * Horizon Client: the launcher's own update, for the sidebar and Settings → About. The main process checks the
 * GitHub releases of sinny999s/Horizon-Launcher at start and every few hours.
 */
export function useHorizonUpdate() {
  const { state } = injection(kSettingsState)
  const env = injection(kEnvironment)
  const { checkUpdate, downloadUpdate, quitAndInstall } = useService(BaseServiceKey)
  const download = useTask((t) => t.type === 'downloaUpdate')

  const current = computed(() => env.value?.version ?? '')
  const version = computed(() => state.value?.updateInfo?.name?.replace(/^v/, '') ?? '')
  /** Whether a check has answered since the launcher started. */
  const checked = computed(() => !!state.value?.updateInfo)
  const stage = computed<HorizonUpdateStage>(() => {
    const s = state.value
    if (!s?.updateInfo?.newUpdate || s.updateStatus === 'none') return 'none'
    if (s.updateStatus === 'ready') return 'ready'
    if (download.task.value) return 'downloading'
    return s.updateInfo.operation === 'autoupdater' ? 'download' : 'manual'
  })
  const percent = computed(() => download.total.value > 0
    ? Math.min(100, Math.floor(download.progress.value / download.total.value * 100))
    : 0)

  const busy = ref(false)
  const checking = ref(false)
  const error = ref('')
  const message = (e: unknown) => (e as any)?.message || String(e)

  /** The one thing to do now: restart into a ready update, or start its download. */
  async function act() {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      if (stage.value === 'ready') await quitAndInstall()
      else if (stage.value === 'download' || stage.value === 'manual') await downloadUpdate()
    } catch (e) {
      error.value = message(e)
    } finally {
      busy.value = false
    }
  }

  async function check() {
    if (checking.value) return
    checking.value = true
    error.value = ''
    try {
      await checkUpdate()
      // A found update downloads by itself after a background check; start it here after a manual one.
      if (stage.value === 'download') downloadUpdate().catch((e) => { error.value = message(e) })
    } catch (e) {
      error.value = message(e)
    } finally {
      checking.value = false
    }
  }

  return { stage, version, current, checked, percent, busy, checking, error, act, check }
}
