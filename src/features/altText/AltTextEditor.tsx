// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FEATURE: Alt Text — UI Editor                                           ║
// ║  The textarea + save button inside the detail panel.                     ║
// ║                                                                          ║
// ║  ✅ SAFE TO EDIT: placeholder text, button label, layout                 ║
// ║  → Save logic: saveAltText.ts                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { panel } from "../../design/layout"

interface AltTextEditorProps {
  value:       string
  saving:      boolean
  saveSuccess: boolean
  justAdded:   boolean
  addMode:     "set" | "add" | null
  onChange:    (v: string) => void
  onSave:      () => void
}

export function AltTextEditor({
  value, saving, saveSuccess,
  justAdded, addMode,
  onChange, onSave,
}: AltTextEditorProps) {
  return (
    <div className="alt-section">
      <div className="meta-label">ALT TEXT</div>
      <textarea
        className="alt-input"
        rows={panel.altTextRows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe this image for accessibility…"
      />
      {saveSuccess && (
        <div className="feedback-ok">✓ Alt text saved!</div>
      )}
      {justAdded && (
        <div className="feedback-ok">
          {addMode === "set" ? "✓ Set on selected frame!" : "✓ Added to canvas!"}
        </div>
      )}
      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save Alt Text"}
      </button>
    </div>
  )
}
