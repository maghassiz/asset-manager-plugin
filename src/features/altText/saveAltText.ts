// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FEATURE: Alt Text — Save Logic                                          ║
// ║  The one function that writes alt text back to Framer.                   ║
// ║                                                                          ║
// ║  ✅ SAFE TO EDIT: nothing (this is stable Framer API logic)              ║
// ║  → UI lives in: AltTextEditor.tsx                                        ║
// ║  → Raw Framer API calls: ../../lib/framerApi.ts                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { saveCanvasAltText, saveCmsAltText } from "../../lib/framerApi"
import type { AssetEntry } from "../../types"

export type SaveAltResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Save the alt text for any asset (canvas or CMS).
 * Returns a result object instead of throwing so the caller
 * can handle success/error without a try/catch every time.
 */
export async function saveAltText(
  asset:  AssetEntry,
  newAlt: string,
): Promise<SaveAltResult> {
  try {
    if (asset.source === "canvas") {
      await saveCanvasAltText(asset.nodeIds, newAlt)
    } else {
      await saveCmsAltText(asset.key, newAlt)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
