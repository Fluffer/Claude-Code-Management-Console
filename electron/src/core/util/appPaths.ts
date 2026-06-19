import * as path from 'path'

/**
 * The application-data folder name, matching C# AppPaths.AppDataFolderName.
 * On Windows: %APPDATA%\ccmc
 * On macOS/Linux: ~/.config/ccmc (Electron maps app.getPath('appData') to ~/.config)
 */
export const APP_DATA_FOLDER_NAME = 'ccmc'

/**
 * Returns the full application-data directory path for CCMC.
 * Pure — takes the platform's appData base dir as a parameter.
 * On Windows: appDataDir = %APPDATA% (e.g. C:\Users\<user>\AppData\Roaming)
 * On macOS: appDataDir = ~/Library/Application Support (Electron) or ~/.config (.NET)
 *
 * The main process supplies this from `app.getPath('appData')`.
 */
export function getAppDataDir(appDataDir: string): string {
  return path.join(appDataDir, APP_DATA_FOLDER_NAME)
}

/**
 * Returns the full path to config.json.
 * Matches C# ConfigService default: Path.Combine(AppPaths.AppDataDir, "config.json").
 */
export function getConfigPath(appDataDir: string): string {
  return path.join(getAppDataDir(appDataDir), 'config.json')
}

/**
 * Returns the full path to state.json.
 * Matches C# StateService default: Path.Combine(AppPaths.AppDataDir, "state.json").
 */
export function getStatePath(appDataDir: string): string {
  return path.join(getAppDataDir(appDataDir), 'state.json')
}
