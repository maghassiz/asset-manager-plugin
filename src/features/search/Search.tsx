// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FEATURE: Search — UI                                                    ║
// ║  Toolbar row: search input + refresh + theme toggle + grid/list toggle.  ║
// ║                                                                          ║
// ║  ✅ SAFE TO EDIT: placeholder text, button labels, icons                 ║
// ║  → Logic lives in: useSearch.ts                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import type { LayoutMode } from "../assetGrid/AssetGrid"

interface SearchProps {
  value:          string
  layout:         LayoutMode
  theme:          "light" | "dark"
  onChange:       (v: string) => void
  onClear:        () => void
  onRefresh:      () => void
  onLayoutChange: (l: LayoutMode) => void
  onThemeToggle:  () => void
}

export function Search({ value, layout, theme, onChange, onClear, onRefresh, onLayoutChange, onThemeToggle }: SearchProps) {
  return (
    <div className="search-row">
      {/* Search input */}
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          placeholder="Search name, location, alt text…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && <button className="clear-btn" onClick={onClear}>✕</button>}
      </div>

      {/* Refresh */}
      <button className="refresh-btn" onClick={onRefresh} title="Refresh assets">↺</button>

      {/* Theme toggle */}
      <button
        className="theme-btn"
        onClick={onThemeToggle}
        title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>

      {/* Layout toggle */}
      <div className="layout-toggle">
        <button
          className={`layout-icon-btn${layout === "grid" ? " active" : ""}`}
          onClick={() => onLayoutChange("grid")}
          title="Grid view"
        >⊞</button>
        <button
          className={`layout-icon-btn${layout === "list" ? " active" : ""}`}
          onClick={() => onLayoutChange("list")}
          title="List view"
        >☰</button>
      </div>
    </div>
  )
}
