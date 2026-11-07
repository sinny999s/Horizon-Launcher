export const IS_DEV = process.env.NODE_ENV === 'development'
/**
 * Horizon Client: the launcher's own data folder (%APPDATA%\horizon-client-launcher).
 * Kept apart from XMCL's `xmcl` folder and from the Rust Horizon launcher's `horizon-launcher` folder.
 */
export const LAUNCHER_NAME = 'horizon-client-launcher'
/** Horizon Client: default game data folder (~/.horizonclient), apart from XMCL's ~/.minecraftx. */
export const DEFAULT_GAME_FOLDER = '.horizonclient'
/** Horizon Client: OS-level URL scheme. Internally requests still use `xmcl://`. */
export const LAUNCHER_PROTOCOL = 'horizonclient'
export const RESOURCE_FILE_VERSION = 2
export const HAS_DEV_SERVER = !!process.env.HAS_DEV_SERVER
