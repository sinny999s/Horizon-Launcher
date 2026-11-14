# Horizon Client launcher

A launcher for the Horizon mod, built from [X Minecraft Launcher](https://github.com/Voxelum/x-minecraft-launcher)
(XMCL) 0.73.1 by ci010 and contributors, MIT licence (see `LICENSE`). Microsoft sign-in, skins, mod browsing
and launching work as they do in XMCL.

## Build

```powershell
powershell -ExecutionPolicy Bypass -File build-horizon.ps1         # installer + portable exe
powershell -ExecutionPolicy Bypass -File build-horizon.ps1 -Dev    # dev mode (renderer on localhost:3000)
```

Output in `xmcl-electron-app/build/output/`:
- `horizon-client-<version>-setup.exe`: NSIS installer (per user, lets you pick the folder).
- `horizon-client-<version>-portable.exe`: single exe, no install.

The repo pins pnpm 11.10.0 and its scripts call `pnpm` again, so a global pnpm 12 fails with
`ERR_PNPM_BAD_PM_VERSION`. The script keeps pnpm 11.10.0 in `.tools/` and puts it first on PATH.

## What differs from XMCL

**Name and data**
- App name "Horizon Client", app id `dev.horizon.launcher`, exe `Horizon Client.exe`, Horizon's icon.
- Launcher data: `%APPDATA%\horizon-client-launcher` (XMCL: `%APPDATA%\xmcl`). Chromium's user data is kept there too.
  `horizon-launcher` is not used because the Rust Horizon client's launcher already owns that name.
- Game data: `~/.horizonclient` (XMCL: `~/.minecraftx`).
- OS link scheme `horizonclient://` (XMCL: `xmcl://`). Inside the app, requests still use `xmcl://`.
- The game is told its launcher is "Horizon Client (version)".

**Look** (taken from the mod's ClickGUI, `design/clickgui` in horizon-main)
- `xmcl-keystone-ui/src/assets/horizon.css`: Horizon's SF font (`assets/horizon/sf_*.ttf`, copied from the mod),
  colour tokens, the grey backdrop with a faint wordmark, the red launch pill, tinted-glass primary buttons, inputs,
  scrollbars, tooltips.
- `views/AppSideBarHorizon.vue` (+ `AppSideBarHorizonInstance.vue`) replaces XMCL's icon rail: wordmark, Menu rows
  (Play, Browse mods, Accounts & skins, Play together, Settings), the instance list with versions, the account card.
  XMCL's sidebar style and position settings no longer apply.
- Theme defaults (`composables/theme.ts`) and Vuetify's dark palette are Horizon's. On first start a build switches to
  Horizon's theme once (`localStorage.horizonTheme`); the XMCL import no longer copies XMCL's theme.
- XMCL's Feedback button is hidden (it reports to XMCL).
- Horizon's own pages (in `xmcl-keystone-ui/src/views/`), built on XMCL's data and install logic:
  - `HomeHeader.vue`: instance icon, name, versions, Play button (`HorizonPlayButton.vue`) and a tab bar
    (Overview, Mods, Worlds, Resource packs, Shaders, Settings).
  - `Home.vue`: the Overview (hero card with Play and the instance's numbers, enabled mods, latest worlds).
  - `HorizonContent.vue`: Mods, Resource packs and Shaders. Installed files as ClickGUI module cards with a toggle,
    and "Browse Modrinth" (this Minecraft version, Fabric for mods) with one-click install and dependencies.
  - `HorizonWorlds.vue`: world cards with show folder, duplicate and delete.
  - `HorizonAccounts.vue`: XMCL's skin panel plus an account list (switch, add, remove).
  - XMCL's original pages stay at `/mods-classic`, `/resourcepacks-classic`, `/shaderpacks-classic`, `/save-classic`
    (the "Tools" buttons), for updates, dependency checks, import/export.
- The sidebar's "Browse mods" opens Modrinth in the current instance. XMCL's store, news and "Play together"
  (XMCL's paid P2P service) are no longer in the sidebar.
- CurseForge is off (`composables/search.ts`): its API needs a key that XMCL builds in at release time.
- Settings: no Appearance section (global) or Appearance tab (instance), and per-instance themes and CSS no longer
  apply (`windows/main/Context.ts`). No update card, no XMCL AI agent settings. About is Horizon's (credit and MIT
  licence, system info); XMCL's account panel, donate badges, contributors and sponsors are gone.
- The title bar has icon-only buttons (search, tasks) and no tutorial. The New instance dialog has just a name, the
  versions and a one-line Fabric note. English strings say "Horizon Client" instead of "XMCL" except for XMCL's own
  services.

**Only Fabric, Minecraft 26.3+** (`xmcl-runtime-api/src/horizon.ts`)
- The Minecraft list holds releases from 26.3 up that Fabric's meta lists. Snapshots and older versions are hidden.
  A new release (26.4...) appears on its own once Mojang releases it and Fabric supports it.
- The loader picker is Fabric only: no Vanilla, Forge, NeoForge, Quilt, OptiFine, LabyMod or "local version".
  The Fabric loader is picked automatically and can't be cleared. There's no Bedrock edition toggle.
- `InstanceService.createInstance` refuses anything else (old versions, other loaders, Bedrock), including modpack
  imports, and fills in a missing Fabric loader.
- The mod browser and modpack store only filter by Fabric.

**Horizon in every new instance** (`xmcl-runtime/horizon/horizonMods.ts`)
- `mods/` gets the Horizon jar, plus Fabric API and Fabric Language Kotlin (newest Modrinth release for that Minecraft
  version, checked against Modrinth's sha1). Horizon depends on both.
- The Horizon jar comes from `xmcl-electron-app/horizon-mod/` (shipped as `resources/horizon-mod/`). The jar for an
  instance's Minecraft version is used: `horizon-<minecraft>-<version>.jar`. `pnpm --prefix=xmcl-electron-app horizon:mod`
  copies the newest one from `../horizon-main/kotlin-client/build/libs`.
- **Always the newest Horizon:** before every launch (`LaunchService.launch` → `updateHorizonMod`), an instance
  that has Horizon turned on gets the newest jar for its Minecraft version from: a Horizon build folder
  (`HORIZON_BUILD_DIR`, `buildDir` in `<launcher data>/horizon.json`, or `~/Downloads/horizon-main/kotlin-client/build/libs`),
  the latest GitHub release of `HORIZON_GITHUB_REPO` (`sinny999s/Horizon-2.1`; the jar asset, checked against its
  sha256 digest), the release manifest, or the bundled jar. A higher version replaces it; from a build folder the same version
  with different bytes (a rebuild) does too. Turned-off or missing Horizon is left alone; a locked jar (game
  running) is skipped and the game launches with what it has. New instances and "Add Horizon" use the same choice.
- **Add Horizon:** the Overview of an instance without Horizon has an "Add Horizon" button
  (`InstanceService.addHorizon`, which also adds Fabric API and Fabric Language Kotlin when missing), or
  "Turn Horizon on" when its jar is there but disabled.
- **Release hook:** set `HORIZON_RELEASE_MANIFEST_URL` in `horizonMods.ts` (or the environment variable of the same name)
  to a JSON file like
  `{ "mods": [{ "minecraft": "26.3", "version": "2.0.5", "url": "https://.../horizon-26.3-2.0.5.jar", "sha1": "..." }] }`.
  The launcher then downloads Horizon from there. The bundled jar is only the fallback.

**Accounts stay signed in** (`xmcl-runtime/user/`, `xmcl-keystone-ui/src/composables/user.ts`, `userRefresh.ts`)
- Switching accounts (any account picker) and pressing Play refresh the account's Minecraft token silently when it is
  expired, invalidated or expires within 2 hours (`USER_TOKEN_REFRESH_MARGIN`), with the saved Microsoft sign-in
  (Windows' account broker, WAM). XMCL refreshed only at startup and before a launch, and its launch opened the
  broker's account picker when the silent refresh missed.
- The broker account is found by its MSAL home account id (`homeAccountId`, now kept in `user.json`), then by email.
  By email alone it missed an account that the broker lists under another of its aliases.
- Only when Microsoft rejects the saved sign-in (interaction required, revoked, account gone from the broker) does it
  ask: the login dialog opens with the email filled in and a note saying why, and a launch stops instead of starting a
  game that can't join servers. A 429 from Minecraft's login or being offline is a notification instead (a launch
  waits 15 s and tries once more after a 429, then launches anyway).
- Startup refreshes the accounts one at a time and stops after a 429 (Minecraft answers 429 to the fourth login in a
  burst, which used to leave that account looking signed out); the rest refresh when switched to or launched.
- `UserException` has a static `exceptionName`: the renderer bundle turns the class into an anonymous class
  expression, which broke every `isException(UserException, …)` check in the renderer.

**Import from XMCL** (`xmcl-electron-app/main/xmclImport.ts`)
- On the first start it finds XMCL's data (the normal `%APPDATA%\xmcl` or the Microsoft Store one in
  `%LOCALAPPDATA%\Packages\xmcl_*\LocalCache\Roaming\xmcl`) and copies:
  accounts (`user.json` and the encrypted tokens in `secret/`), saved skins (`closet/`), settings (`setting.json`),
  Java list (`java.json`, real `java`/`javaw` executables only), theme, and every Minecraft 26.3+ Fabric instance.
- Instances are copied without `.fabric`, `logs`, `crash-reports`, `*.bk` and the links XMCL makes to its shared
  `libraries`/`versions` folders. The launcher downloads its own game files.
- Tokens are encrypted with Electron's safeStorage key, which lives in Chromium's `Local State`. The import copies that
  key into our own `Local State` before Chromium starts, so the tokens decrypt here. XMCL's files are only read.
- It runs once (`.xmcl-import.json` marks it) and only if this launcher has no accounts yet.
- `HORIZON_NO_XMCL_IMPORT=1` turns it off.

**Updates itself** (`main/utils/updater.ts`, `main/pluginAutoUpdate.ts`, `xmcl-runtime/app/BaseService.ts`)
- The feed is the GitHub releases of `sinny999s/Horizon-Launcher` (`publish` in `build/electron-builder.config.ts`,
  baked into `resources/app-update.yml`). electron-updater reads `latest.yml` from the newest release.
- At start and every 6 hours the launcher checks. A newer installed-Windows build is downloaded right away (a task in
  the task list), then the sidebar shows "Restart to update" above the account card. That installs it silently and
  starts the new version; otherwise it installs silently when the launcher closes.
- Settings → About shows the state and has "Check for updates".
- The portable exe, an unpacked build and macOS can't replace themselves: they read the newest release from GitHub's
  API and offer its download page.
- No `publisherName` in `win.signtoolOptions`: electron-updater would check the unsigned installer against it and
  refuse every update. Add it back together with a code-signing certificate.
- XMCL's own update paths are off: its update server (`api.xmcl.app/latest`), its app.asar swap and its mirror.
- `HORIZON_DISABLE_UPDATES=1` turns updates off (use it for test copies of the launcher), and `HORIZON_UPDATE_URL=<url>`
  reads `latest.yml` from another folder instead (for testing an update end to end).
- Version 0.73.1 (XMCL's number, the first release) had no updater; it has to be replaced by hand once.

**Off until Horizon has its own services**
- Telemetry export. The key in `APP_INSIGHT_KEY` belongs to XMCL's Azure account, so traces and logs aren't exported.
- Windows targets are only `nsis` and `portable` (x64). XMCL's `zip`, `ia32` and `appx`/Microsoft Store targets are gone.

## Testing on a clean profile

`HORIZON_APP_DATA=<dir>` moves the launcher data folder and `HORIZON_GAME_DATA=<dir>` moves the game folder the
import creates, e.g. to test the import without touching the real profile.

## Releasing

1. Raise `version` in `package.json` and `xmcl-electron-app/package.json` (semver; installed launchers only take a
   higher one).
2. Build with the released Horizon jar bundled, not whatever is in `build/libs`:
   `$env:HORIZON_MOD_JAR = "<path to the release's horizon-26.3-<ver>.jar>"; powershell -ExecutionPolicy Bypass -File build-horizon.ps1`
3. Commit, push `main`, and make the release with **all four** files from `xmcl-electron-app/build/output/`:
   `gh release create vX.Y.Z --title "Horizon Launcher X.Y.Z" horizon-client-X.Y.Z-setup.exe horizon-client-X.Y.Z-setup.exe.blockmap latest.yml horizon-client-X.Y.Z-portable.exe`.
   Without `latest.yml` installed launchers don't see the release; the blockmap lets them download only what changed.

## Not done

- Code signing. The installer is unsigned, so SmartScreen warns on first run.
- The macOS (`.icns`), Linux packages and `deskgap-app` still carry XMCL's names and icons in places. Only Windows was built.
- The HTTP user agent still names XMCL (`voxelum/x_minecraft_launcher/...`), because XMCL's CurseForge proxy and
  API keys go with it.
- Microsoft sign-in uses XMCL's Azure client id, as XMCL does. A Horizon-owned Azure app would need Mojang's approval
  for Minecraft API access.
