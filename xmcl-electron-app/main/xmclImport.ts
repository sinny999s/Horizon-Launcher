/**
 * Horizon Client: one-time import from an existing X Minecraft Launcher install.
 *
 * On the first start (no `user.json` in our data folder and no import marker) this copies the user's
 * XMCL accounts, saved skins, launcher settings and theme, plus every Minecraft 26.3+ Fabric instance.
 * XMCL's own files are only read, never changed.
 *
 * Account tokens are encrypted with Electron `safeStorage`, whose key lives in the `os_crypt` section of
 * Chromium's `Local State` file in the user-data folder. We copy that section into our own `Local State`
 * before Chromium reads it, so the copied `secret/` files decrypt here as they did in XMCL. So the import
 * runs synchronously at the top of the main script, before the app is constructed (copying instances can
 * take a few seconds, once).
 */
import { app } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync, lstatSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { DEFAULT_GAME_FOLDER, LAUNCHER_NAME } from '@xmcl/runtime/constant'

const MARKER = '.xmcl-import.json'

/** Files and folders copied from XMCL's data folder as they are. */
const COPIED_FILES = ['user.json', 'user.json.backup', 'user.json.meta', 'setting.json', 'java.json', 'theme.json']
const COPIED_DIRS = ['closet', 'theme-media']

/** Instance sub-folders left behind: caches, logs and old backups the game rebuilds or doesn't need. */
const SKIPPED_INSTANCE_DIRS = new Set(['.fabric', 'logs', 'crash-reports', 'libraries.bk', 'versions.bk', '.install-profile'])

/** Candidate XMCL data folders: the normal install and the Microsoft Store (MSIX) one. */
export function findXmclDataFolders(): string[] {
  const found: string[] = []
  const roaming = app.getPath('appData')
  const plain = join(roaming, 'xmcl')
  if (existsSync(join(plain, 'user.json'))) found.push(plain)
  if (process.platform === 'win32') {
    const packages = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Packages')
    try {
      for (const name of readdirSync(packages)) {
        if (!name.toLowerCase().startsWith('xmcl_')) continue
        const dir = join(packages, name, 'LocalCache', 'Roaming', 'xmcl')
        if (existsSync(join(dir, 'user.json'))) found.push(dir)
      }
    } catch { }
  }
  // Prefer the one used most recently.
  return found.sort((a, b) => mtime(join(b, 'user.json')) - mtime(join(a, 'user.json')))
}

function mtime(file: string) {
  try { return statSync(file).mtimeMs } catch { return 0 }
}

/** Parses "26.3", "26.3.1", "26.4" into [major, minor, patch]. Returns undefined for snapshots and other ids. */
function parseRelease(id: string): number[] | undefined {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(id)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : undefined
}

function isHorizonInstance(runtime: Record<string, string> | undefined) {
  if (!runtime) return false
  const v = parseRelease(runtime.minecraft ?? '')
  if (!v || v[0] < 26 || (v[0] === 26 && v[1] < 3)) return false
  if (!runtime.fabricLoader) return false
  return !runtime.forge && !runtime.neoForged && !runtime.quiltLoader && !runtime.optifine && !runtime.labyMod
}

/** Call at the top of the main script, before the app is constructed. Does nothing after the first time. */
export function importXmcl(isDev: boolean) {
  if (process.env.XMCL_E2E || process.env.HORIZON_NO_XMCL_IMPORT) return undefined
  const ours = join(app.getPath('appData'), LAUNCHER_NAME)
  if (existsSync(join(ours, MARKER)) || existsSync(join(ours, 'user.json'))) return undefined
  const from = findXmclDataFolders()[0]
  if (!from) return undefined

  mkdirSync(ours, { recursive: true })

  // The safeStorage key. Only when we have no Local State yet, so an existing key is never replaced.
  const ourState = join(ours, 'Local State')
  if (!existsSync(ourState)) {
    try {
      const theirs = JSON.parse(readFileSync(join(from, 'Local State'), 'utf-8'))
      if (theirs?.os_crypt?.encrypted_key) {
        writeFileSync(ourState, JSON.stringify({ os_crypt: theirs.os_crypt }))
      }
    } catch { }
  }

  // Encrypted tokens (Microsoft accounts, Xbox device key...). XMCL's release build uses `secret`; a dev
  // build reads `secret-dev`, so it gets a copy too, and a release build started later still finds them.
  const secretFrom = join(from, 'secret')
  if (existsSync(secretFrom)) {
    for (const to of isDev ? ['secret', 'secret-dev'] : ['secret']) {
      mkdirSync(join(ours, to), { recursive: true })
      for (const f of readdirSync(secretFrom)) {
        try { copyFileSync(join(secretFrom, f), join(ours, to, f)) } catch { }
      }
    }
  }

  for (const f of COPIED_FILES) {
    try { if (existsSync(join(from, f))) copyFileSync(join(from, f), join(ours, f)) } catch { }
  }
  // Only real Java executables. XMCL's list can hold other programs added by hand (such as the Rust
  // Horizon client's `horizon-xmcl-bridge.exe`), which would otherwise be picked to run Minecraft.
  try {
    const javaFile = join(ours, 'java.json')
    if (existsSync(javaFile)) {
      const java = JSON.parse(readFileSync(javaFile, 'utf-8'))
      if (Array.isArray(java.all)) {
        java.all = java.all.filter((j: any) => typeof j?.path === 'string' && /^javaw?(\.exe)?$/i.test(basename(j.path)))
        writeFileSync(javaFile, JSON.stringify(java))
      }
    }
  } catch { }

  // Our game folder. Instances go there; writing `root` also skips the first-run folder picker.
  const gameRoot = process.env.HORIZON_GAME_DATA || join(homedir(), DEFAULT_GAME_FOLDER)
  let xmclRoot: string | undefined
  const instances: string[] = []
  try { xmclRoot = readFileSync(join(from, 'root'), 'utf-8').trim() } catch { }
  if (!existsSync(join(ours, 'root'))) {
    writeFileSync(join(ours, 'root'), gameRoot)
    if (xmclRoot && !existsSync(join(gameRoot, 'instances'))) {
      try {
        for (const name of readdirSync(join(xmclRoot, 'instances'))) {
          try {
            const inst = JSON.parse(readFileSync(join(xmclRoot, 'instances', name, 'instance.json'), 'utf-8'))
            if (isHorizonInstance(inst.runtime)) instances.push(name)
          } catch { }
        }
      } catch { }
    }
  }

  for (const d of COPIED_DIRS) {
    try {
      if (existsSync(join(from, d))) cpSync(join(from, d), join(ours, d), { recursive: true, force: false, errorOnExist: false })
    } catch { }
  }

  const copied: string[] = []
  if (xmclRoot && instances.length > 0) {
    mkdirSync(join(gameRoot, 'instances'), { recursive: true })
    for (const name of instances) {
      const src = join(xmclRoot, 'instances', name)
      const dst = join(gameRoot, 'instances', name)
      try {
        cpSync(src, dst, {
          recursive: true,
          force: false,
          errorOnExist: false,
          filter: (s) => {
            const rel = s.substring(src.length + 1)
            const top = rel.split(/[\\/]/)[0]
            if (SKIPPED_INSTANCE_DIRS.has(top)) return false
            // XMCL links an instance's `libraries`/`versions` to its shared folders (junctions). Links are
            // left out, so nothing here points back into XMCL's data; the launcher downloads its own copy.
            try { return !lstatSync(s).isSymbolicLink() } catch { return false }
          },
        })
        // XMCL stores the instance's absolute path in instance.json on some versions: point it here.
        const jsonPath = join(dst, 'instance.json')
        const json = JSON.parse(readFileSync(jsonPath, 'utf-8'))
        if (typeof json.path === 'string') {
          json.path = dst
          writeFileSync(jsonPath, JSON.stringify(json, null, 2))
        }
        copied.push(name)
      } catch (e) {
        console.warn(`[XmclImport] Failed to copy instance ${name}`, e)
        try { rmSync(dst, { recursive: true, force: true }) } catch { }
      }
    }
    if (copied.length > 0) {
      // Same shape as XMCL's: managed instances by folder name.
      try {
        writeFileSync(join(ours, 'instances.json'), JSON.stringify({
          selectedInstance: copied[0],
          instances: copied,
          groups: copied,
        }, null, 2))
      } catch { }
    }
  }

  writeFileSync(join(ours, MARKER), JSON.stringify({ from, instances: copied, date: new Date().toISOString() }, null, 2))
  console.log(`[XmclImport] Imported accounts and settings from ${from}; instances: ${copied.join(', ') || 'none'}`)
}
