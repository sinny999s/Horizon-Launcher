# Bundled Horizon mod

Jars here (`horizon-<minecraft>-<version>.jar`) ship with the launcher (electron-builder `extraResources`) and
are copied into every new instance's `mods/` folder whose Minecraft version matches. The newest version wins.

The jars are not committed. Fill this folder before building:

```sh
pnpm --prefix=xmcl-electron-app horizon:mod            # copies ../horizon-main/kotlin-client/build/libs/horizon-26.3-*.jar
HORIZON_MOD_JAR=path/to/horizon.jar pnpm --prefix=xmcl-electron-app horizon:mod
```

To deliver Horizon from a release URL instead, set `HORIZON_RELEASE_MANIFEST_URL` in
`xmcl-runtime/horizon/horizonMods.ts` (or the environment variable of the same name). The bundled jar is
then only the fallback.
