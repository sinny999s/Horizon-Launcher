# Horizon Client: build the Windows installer and portable exe.
#   powershell -ExecutionPolicy Bypass -File build-horizon.ps1          # installer + portable
#   powershell -ExecutionPolicy Bypass -File build-horizon.ps1 -Dev     # run in dev mode instead
# The repo pins pnpm 11.10.0 and its scripts call `pnpm` again, so a global pnpm 12 fails
# (ERR_PNPM_BAD_PM_VERSION). This keeps pnpm 11.10.0 in .tools and puts it first on PATH.
param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path .tools\node_modules\.bin\pnpm.cmd)) {
  npm install --no-save --prefix .tools pnpm@11.10.0
}
$env:PATH = "$PSScriptRoot\.tools\node_modules\.bin;$env:PATH"
pnpm install --frozen-lockfile
if ($LASTEXITCODE) { exit $LASTEXITCODE }
# Bundle the newest Horizon jar from ..\horizon-main\kotlin-client\build\libs (or $env:HORIZON_MOD_JAR).
pnpm --prefix=xmcl-electron-app horizon:mod
if ($LASTEXITCODE) { exit $LASTEXITCODE }
if ($Dev) {
  Start-Process -NoNewWindow pnpm 'dev:renderer'
  pnpm dev:main
  exit $LASTEXITCODE
}
pnpm build:renderer
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pnpm --prefix=xmcl-electron-app build:all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Get-ChildItem xmcl-electron-app\build\output\horizon-client-*.exe | Select-Object Name, Length
