import { readFileUtf8, writeFileAtomic } from '../os/atomicFile'

/**
 * Reads the .env file at `envPath` and returns its raw text content.
 * Returns null if the file does not exist.
 * The content transforms (parse/setKey/removeKey) live in core/config/envFileEditor.
 */
export async function readEnv(envPath: string): Promise<string | null> {
  return readFileUtf8(envPath)
}

/**
 * Writes raw .env text `contents` to `envPath` atomically (UTF-8 without BOM).
 */
export async function writeEnv(envPath: string, contents: string): Promise<void> {
  await writeFileAtomic(envPath, contents)
}
