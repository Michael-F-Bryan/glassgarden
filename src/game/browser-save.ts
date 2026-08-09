/**
 * The only module that touches browser storage for saves. Both
 * `Storage.getItem` and `Storage.setItem` can throw (quota, private
 * browsing, disabled storage), so every call is caught and turned into a
 * typed outcome instead of an unhandled exception during boot/autosave.
 *
 * Takes a `Storage` so it is unit-testable against an in-memory fake —
 * no jsdom/localStorage mock needed.
 */
import { decodeSave, SAVE_KEY, type LoadResult, type SaveFile } from './save'

/** Where an invalid/unsupported payload is preserved, so a bad save is
 * never silently overwritten by the next autosave before a human sees it. */
export const RECOVERY_KEY = 'glassgarden-save-recovery'

export function loadFromStorage(storage: Storage): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch (error) {
    return { kind: 'invalid', raw: '', issues: [`could not read storage: ${String(error)}`] }
  }

  const result = decodeSave(raw)
  if (result.kind === 'invalid' || result.kind === 'unsupported') {
    // Preserve before the caller could ever run an autosave that would
    // overwrite SAVE_KEY with a fresh game over the only copy of this data.
    try {
      storage.setItem(RECOVERY_KEY, result.raw)
    } catch {
      // Best effort: if storage can't take the recovery copy either, the
      // load outcome is still reported truthfully to the caller.
    }
  }
  return result
}

export function saveToStorage(storage: Storage, save: SaveFile): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}
