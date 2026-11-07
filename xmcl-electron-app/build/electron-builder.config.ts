/* eslint-disable no-template-curly-in-string */
import { config as dotenv } from 'dotenv'
import type { Configuration } from 'electron-builder'
import { resolve } from 'path'

dotenv()

const linuxPackageScripts = {
  afterInstall: 'build/linux/after-install.tpl',
  afterRemove: 'build/linux/after-remove.tpl',
  appArmorProfile: 'build/linux/apparmor-profile.tpl',
  fpm: [`--after-upgrade=${resolve(__dirname, 'linux', 'after-install.tpl')}`],
}

export const config = {
  // Horizon Client: its own name and id, so it installs beside XMCL instead of over it.
  productName: 'Horizon Client',
  appId: 'dev.horizon.launcher',
  directories: {
    output: 'build/output',
    buildResources: 'build',
    app: '.',
  },
  protocols: {
    name: 'Horizon Client',
    schemes: ['horizonclient'],
  },
  // assign publish for auto-updater
  // set this to your own repo!
  // Horizon Client: no update feed yet. Point this at the Horizon release repo to turn on auto-update.
  publish: null,
  files: [{
    from: 'dist',
    to: '.',
    filter: ['**/*.js', '**/*.ico', '**/*.png', '**/*.webp', '**/*.svg', '*.node', '*.dll', '**/*.html', '**/*.css', '**/*.woff2', '**/*.wasm'],
  }, {
    from: '.',
    to: '.',
    filter: 'package.json',
  }],
  extraResources: [{
    from: 'main/agent-documents',
    to: 'agent-documents',
    filter: ['**/*.md'],
  }, {
    // Horizon Client: the Horizon mod jar(s) copied into new instances (see horizon-mod/README.md).
    from: 'horizon-mod',
    to: 'horizon-mod',
    filter: ['*.jar'],
  }],
  artifactName: 'horizon-client-${version}-${platform}-${arch}.${ext}',
  appx: {
    displayName: 'XMCL',
    applicationId: 'xmcl',
    identityName: 'xmcl',
    backgroundColor: 'transparent',
    publisher: process.env.PUBLISHER,
    publisherDisplayName: 'CI010',
    setBuildNumber: true,
  },
  dmg: {
    artifactName: 'xmcl-${version}-${arch}.${ext}',
    contents: [
      {
        x: 410,
        y: 150,
        type: 'link',
        path: '/Applications',
      },
      {
        x: 130,
        y: 150,
        type: 'file',
      },
    ],
  },
  mac: {
    icon: 'icons/dark.icns',
    darkModeSupport: true,
    target: [
      {
        target: 'dmg',
        arch: ['arm64', 'x64'],
      },
    ],
    extendInfo: {
      NSLocalNetworkUsageDescription: 'XMCL and Minecraft need access to your local network to discover and connect to LAN games and servers.',
      NSMicrophoneUsageDescription: 'A Minecraft mod wants to access your microphone.',
      NSCameraUsageDescription: 'Please give us access to your camera',
      'com.apple.security.device.audio-input': true,
      'com.apple.security.device.camera': true,
    },
  },
  win: {
    signtoolOptions: {
      certificateFile: undefined as string | undefined,
      publisherName: 'Horizon',
    },
    icon: 'icons/dark.ico',
    electronLanguages: ['en-US'],
    // Horizon Client: an NSIS installer and a single-file portable exe (MC 26.3 needs 64-bit Java anyway).
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: 'horizon-client-${version}-setup.${ext}',
    shortcutName: 'Horizon Client',
    uninstallDisplayName: 'Horizon Client',
    // The licence page shows build/license.txt (XMCL's MIT licence with a credit line).
  },
  portable: {
    artifactName: 'horizon-client-${version}-portable.${ext}',
  },
  linux: {
    executableName: 'horizon-client',
    electronLanguages: ['en-US'],
    desktop: {
      entry: {
        MimeType: 'x-scheme-handler/horizonclient',
        StartupWMClass: 'horizon-client',
      },
    },
    category: 'Game',
    icon: 'icons/dark.icns',
    artifactName: 'horizon-client-${version}-${arch}.${ext}',
    target: [
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64', 'arm64'] },
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'tar.xz', arch: ['x64', 'arm64'] },
      { target: 'pacman', arch: ['x64', 'arm64'] },
    ],
  },
  deb: linuxPackageScripts,
  rpm: linuxPackageScripts,
  pacman: linuxPackageScripts,
  snap: {
    publish: [
      'github',
    ],
  },
} satisfies Configuration
