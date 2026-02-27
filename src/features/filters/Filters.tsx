// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FEATURE: Filters — UI                                                   ║
// ║  Two labeled rows of filter buttons: Resource row + Storage row.         ║
// ║                                                                          ║
// ║  ✅ SAFE TO EDIT: tab labels, row labels, icons                          ║
// ║  → Logic lives in: useFilters.ts                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import type { SourceFilter, StorageFilter } from "../../types"

interface FiltersProps {
  sourceFilter:    SourceFilter
  storageFilter:   StorageFilter
  onSourceChange:  (f: SourceFilter)  => void
  onStorageChange: (f: StorageFilter) => void
  countFor:        (f: SourceFilter)  => number
  storageCountFor: (f: StorageFilter) => number
}

const SOURCE_TABS: { label: string; value: SourceFilter }[] = [
  { label: "ALL",    value: "all"    },
  { label: "CANVAS", value: "canvas" },
  { label: "CMS",    value: "cms"    },
]

const STORAGE_TABS: { label: string; value: StorageFilter }[] = [
  { label: "ALL STORAGE", value: "all"      },
  { label: "⬡ FRAMER",   value: "framer"   },
  { label: "↗ EXTERNAL", value: "external" },
]

export function Filters({
  sourceFilter, storageFilter,
  onSourceChange, onStorageChange,
  countFor, storageCountFor,
}: FiltersProps) {
  return (
    <>
      {/* Resource filter row */}
      <div className="filter-row">
        <span className="filter-row-label">Resource</span>
        {SOURCE_TABS.map(({ label, value }) => (
          <button
            key={value}
            className={`filter-tab${sourceFilter === value ? " active" : ""}`}
            onClick={() => onSourceChange(value)}
          >
            {label}
            <span className="filter-count">{countFor(value)}</span>
          </button>
        ))}
      </div>

      {/* Storage filter row */}
      <div className="filter-row filter-row-storage">
        <span className="filter-row-label">Storage</span>
        {STORAGE_TABS.map(({ label, value }) => (
          <button
            key={value}
            className={`filter-tab filter-tab-sm${
              storageFilter === value ? ` active storage-active-${value}` : ""
            }`}
            onClick={() => onStorageChange(value)}
          >
            {label}
            <span className="filter-count">{storageCountFor(value)}</span>
          </button>
        ))}
      </div>
    </>
  )
}
