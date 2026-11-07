/**
 * Copies the Horizon mod jar into horizon-mod/ so it's bundled with the launcher.
 * Source: $HORIZON_MOD_JAR, else the newest horizon-26.3-*.jar built by ../../horizon-main/kotlin-client.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { basename, join, resolve } from 'path'

const target = resolve(__dirname, '..', 'horizon-mod')
let source = process.env.HORIZON_MOD_JAR
if (!source) {
  const libs = resolve(__dirname, '..', '..', '..', 'horizon-main', 'kotlin-client', 'build', 'libs')
  const jars = existsSync(libs)
    ? readdirSync(libs).filter(f => /^horizon-\d+\.\d+(\.\d+)?-.+\.jar$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : []
  if (jars.length === 0) {
    console.error(`No Horizon jar found in ${libs}. Set HORIZON_MOD_JAR.`)
    process.exit(1)
  }
  source = join(libs, jars[jars.length - 1])
}
mkdirSync(target, { recursive: true })
copyFileSync(source, join(target, basename(source)))
console.log(`Bundled ${basename(source)} -> ${target}`)
