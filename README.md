<div align="center">

# Horizon Launcher

**The Windows launcher for the [Horizon](https://github.com/sinny999s/Horizon-2.1) Fabric mod (Minecraft 26.3+)**

[![Release](https://img.shields.io/github/v/release/sinny999s/Horizon-Launcher?style=for-the-badge&color=FF2A4A)](https://github.com/sinny999s/Horizon-Launcher/releases/latest)
[![Mod](https://img.shields.io/badge/Mod-Horizon--2.1-black?style=for-the-badge&logo=github)](https://github.com/sinny999s/Horizon-2.1)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

</div>

Horizon Launcher (the app is called "Horizon Client") installs Minecraft with Fabric, puts the
[Horizon mod](https://github.com/sinny999s/Horizon-2.1) in every instance and keeps it up to date. It is built from
[X Minecraft Launcher](https://github.com/Voxelum/x-minecraft-launcher) (XMCL) by ci010 and contributors.

## Download

Get `horizon-client-<version>-setup.exe` (installer, per user) or `horizon-client-<version>-portable.exe` (no install)
from the [latest release](https://github.com/sinny999s/Horizon-Launcher/releases/latest).

The exe isn't code-signed yet, so Windows SmartScreen warns on the first run: "More info", then "Run anyway".

## What it does

- **Fabric only, Minecraft 26.3 and up.** New instances get the Horizon jar, Fabric API and Fabric Language Kotlin.
- **Always the newest Horizon.** Before every launch, an instance with Horizon turned on gets the newest Horizon jar
  for its Minecraft version: the latest [Horizon-2.1 release](https://github.com/sinny999s/Horizon-2.1/releases)
  (checked against its sha256) or a local mod build, whichever is newer. Instances without Horizon get an
  "Add Horizon" button.
- **Microsoft sign-in that stays signed in.** Switching accounts and pressing Play refresh an expired token silently.
- **Horizon's look**, taken from the mod's ClickGUI: sidebar, cards, the red launch button.
- **Mods, resource packs and shaders** from Modrinth with one-click install, plus worlds and skins.
- **Updates itself** from this repository's releases: a new version downloads in the background, then "Restart to
  update" in the sidebar installs it (or it installs when you close the launcher). Version 0.73.1 can't update
  itself yet, so install 1.0.0 over it once.
- **Imports from XMCL** on the first start: accounts, skins, settings and 26.3+ Fabric instances (read-only on XMCL's side).

Launcher data is in `%APPDATA%\horizon-client-launcher` and game data in `~/.horizonclient`, apart from XMCL's.

[HORIZON.md](HORIZON.md) lists everything that differs from XMCL, with the files involved.

## Build

Windows, Node 22+:

```powershell
powershell -ExecutionPolicy Bypass -File build-horizon.ps1         # installer + portable exe
powershell -ExecutionPolicy Bypass -File build-horizon.ps1 -Dev    # dev mode
```

The output goes to `xmcl-electron-app/build/output/`. The script bundles the newest Horizon jar from
`../horizon-main/kotlin-client/build/libs`, or the one `HORIZON_MOD_JAR` points to.

## Credits and licence

Horizon Launcher is a fork of [X Minecraft Launcher](https://github.com/Voxelum/x-minecraft-launcher) by
[ci010](https://github.com/ci010) and its contributors, used under the MIT licence (see [LICENSE](LICENSE)). The git
history keeps XMCL's commits. Please report problems with this launcher here, not to XMCL.

Minecraft is a trademark of Mojang AB. Horizon Launcher is not affiliated with Mojang or Microsoft.
