// eslint-disable-next-line @typescript-eslint/no-var-requires
require('graceful-fs').gracefulify(require('fs'))

// eslint-disable-next-line import/first
import { app } from 'electron'
// eslint-disable-next-line import/first
import ElectronLauncherApp from './ElectronLauncherApp'
// eslint-disable-next-line import/first
import { join } from 'path'
// eslint-disable-next-line import/first
import { LAUNCHER_NAME } from '@xmcl/runtime/constant'
// eslint-disable-next-line import/first
import { importXmcl } from './xmclImport'
// eslint-disable-next-line import/first
import { IS_DEV } from './constant'

// Horizon Client: HORIZON_APP_DATA moves the whole launcher data folder (for testing on a clean profile).
if (process.env.HORIZON_APP_DATA && !process.env.XMCL_E2E_APP_DATA) {
  app.setPath('appData', process.env.HORIZON_APP_DATA)
}
// Horizon Client: keep Chromium's user data (Local State, caches) in our own folder, never XMCL's.
if (!process.env.XMCL_E2E_APP_DATA) {
  app.setPath('userData', join(app.getPath('appData'), LAUNCHER_NAME))
}
// Horizon Client: first start imports accounts, settings and 26.3+ Fabric instances from XMCL (read-only).
// This must stay synchronous and before the app is constructed: see xmclImport.ts.
try {
  importXmcl(IS_DEV)
} catch (e) {
  console.error('[XmclImport] failed', e)
}

// Disable sandbox for AppImage to avoid chrome-sandbox permission issues
// AppImage mounts to /tmp which cannot have proper setuid permissions
if (process.env.APPIMAGE) {
  app.commandLine.appendSwitch('no-sandbox')
}

// E2E-only network probe. Dispatches exactly one HTTP request through the SAME
// bundled `undici` the launcher uses for every download, forcing its
// llhttp-wasm parser to initialise. The parser is read at runtime from the
// on-disk `.wasm` the native esbuild plugin extracts next to the bundle, so
// this exercises the packaged-`app.asar` file resolution that regressed on
// macOS in #1576 (PR #1578). The packaged-boot e2e calls this after boot and
// asserts it resolves — a plain boot never touches the parser, so it can't
// catch the regression on its own. Inert unless XMCL_E2E is set.
if (process.env.XMCL_E2E) {
  Object.defineProperty(globalThis, '__xmclE2EProbeHttp', {
    configurable: true,
    value: async (url: string) => {
      const { request } = await import('undici')
      const res = await request(url, { method: 'GET' })
      const body = await res.body.text()
      return { status: res.statusCode, bodyLength: body.length }
    },
  })
}

new ElectronLauncherApp().start()
