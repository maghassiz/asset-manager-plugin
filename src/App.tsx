import { useEffect, useRef, useState } from "react"
import { framer } from "framer-plugin"
import "./App.css"

import { PLUGIN_NAME, PLUGIN_UI, FEATURES, ADD_SUCCESS_DURATION_MS } from "./plugin.config"
import type { AssetEntry } from "./types"
import { useAssets } from "./hooks/useAssets"
import { navigateToNode, smartAdd } from "./lib/framerApi"
import { Search } from "./features/search/Search"
import { useSearch } from "./features/search/useSearch"
import { Filters } from "./features/filters/Filters"
import { useFilters, buildCountHelpers } from "./features/filters/useFilters"
import { AssetGrid } from "./features/assetGrid/AssetGrid"
import type { LayoutMode } from "./features/assetGrid/AssetGrid"
import { saveAltText } from "./features/altText/saveAltText"
import { useNavigator } from "./features/navigator/useNavigator"
import { DetailPanel } from "./components/DetailPanel"
import { initAnalytics, trackEvent, endSession, EVENTS } from "./lib/analytics"

framer.showUI({ title: PLUGIN_NAME, ...PLUGIN_UI })

export function App() {
  // ── Data ────────────────────────────────────────────────────────────────────
  const { assets, loading, loadError, refresh } = useAssets()
  const [hasSelection, setHasSelection] = useState(false)
  useEffect(() => framer.subscribeToSelection((s) => setHasSelection(s.length > 0)), [])

  // ── Layout mode ─────────────────────────────────────────────────────────────
  const [layout, setLayout] = useState<LayoutMode>("grid")

  // ── Theme ────────────────────────────────────────────────────────────────────
  // Defaults to dark. Persists the user's choice via framer.setPluginData
  // so it remembers across sessions — light stays light, dark stays dark.
  const [theme, setTheme] = useState<"light" | "dark">("dark")

  // Load saved theme on mount
  useEffect(() => {
    framer.getPluginData("theme").then((saved) => {
      const t = saved === "light" ? "light" : "dark"
      setTheme(t)
      applyTheme(t)
    })
  }, [])

  // Apply DOM changes synchronously
  const applyTheme = (t: "light" | "dark") => {
    const isDark = t === "dark"
    document.documentElement.classList.toggle("dark", isDark)
    document.documentElement.style.colorScheme = isDark ? "dark" : "light"
  }

  // Toggle and persist choice
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light"
      applyTheme(next)
      framer.setPluginData("theme", next)
      trackEvent(EVENTS.THEME_TOGGLED, { theme: next })
      return next
    })
  }

  // ── Search + filters ────────────────────────────────────────────────────────
  const { search, setSearch, matches: matchesSearch } = useSearch()
  const { sourceFilter, storageFilter, setSourceFilter, setStorageFilter, matchesSource, matchesStorage } = useFilters()

  const filtered = assets.filter(
    (a) => matchesSource(a, sourceFilter) && matchesStorage(a, storageFilter) && matchesSearch(a)
  )
  const { countFor, storageCountFor } = buildCountHelpers(
    assets, sourceFilter, storageFilter, matchesSearch, matchesSource, matchesStorage,
  )

  // ── Analytics: init once assets are loaded ──────────────────────────────────
  const analyticsInitialised = useRef(false)
  useEffect(() => {
    if (loading || analyticsInitialised.current) return
    analyticsInitialised.current = true
    initAnalytics({ theme, assetsLoaded: assets.length })
    return () => { endSession() }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track assets_loaded on every refresh
  const prevAssetCount = useRef<number | null>(null)
  useEffect(() => {
    if (loading || !analyticsInitialised.current) return
    if (prevAssetCount.current !== assets.length) {
      prevAssetCount.current = assets.length
      trackEvent(EVENTS.ASSETS_LOADED, { count: assets.length })
    }
  }, [assets.length, loading])

  // ── Detail panel ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<AssetEntry | null>(null)
  const [editingAlt, setEditingAlt] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ── Add to canvas ───────────────────────────────────────────────────────────
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [addedKey, setAddedKey] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<"set" | "add" | null>(null)

  // ── Usage navigator ─────────────────────────────────────────────────────────
  const { navIndex, nodePageNames, initNav, stepPrev, stepNext, navToIndex, navToCurrentNode } =
    useNavigator(selected)

  // ── Handlers ────────────────────────────────────────────────────────────────
  const openDetail = (a: AssetEntry) => {
    setSelected(a)
    setEditingAlt(a.altText)
    setSaveSuccess(false)
    initNav(a)
    trackEvent(EVENTS.DETAIL_OPENED, {
      asset_type: a.assetType,
      source: a.source,
      storage: a.storageSource,
      has_alt_text: !!a.altText,
      node_count: a.nodeIds.length,
    })
  }

  const handleSaveAlt = async () => {
    if (!selected) return
    setSaving(true)
    setSaveSuccess(false)
    const result = await saveAltText(selected, editingAlt)
    if (result.ok) {
      setSelected((p) => p ? { ...p, altText: editingAlt } : null)
      setSaveSuccess(true)
      trackEvent(EVENTS.ALT_TEXT_SAVED, {
        source: selected.source,
        storage: selected.storageSource,
        alt_text_length: editingAlt.length,
      })
    } else {
      alert(`Save failed: ${result.error}`)
    }
    setSaving(false)
  }

  const doAdd = async (asset: AssetEntry) => {
    if (asset.assetType === "video") {
      if (asset.navigateId) await navigateToNode(asset.navigateId)
      return
    }
    if (!FEATURES.canvasActions) return
    setAddingKey(asset.key)
    try {
      const mode = await smartAdd(asset)
      setAddMode(mode)
      setAddedKey(asset.key)
      trackEvent(mode === "set" ? EVENTS.SET_ON_FRAME : EVENTS.ADD_TO_CANVAS, {
        source: asset.source,
        storage: asset.storageSource,
      })
      setTimeout(() => { setAddedKey(null); setAddMode(null); refresh() }, ADD_SUCCESS_DURATION_MS)
    } catch (err) {
      alert(`Could not add to canvas: ${err}`)
    } finally {
      setAddingKey(null)
    }
  }

  // ── Search debounce tracking ──────────────────────────────────────────────
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (v.trim().length > 1) {
      searchDebounce.current = setTimeout(() => {
        trackEvent(EVENTS.SEARCH_USED, { query_length: v.trim().length })
      }, 800)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="plugin-root">

      {/* ── Search row: input + refresh + layout toggle ───────────────────── */}
      {FEATURES.search && (
        <Search
          value={search}
          layout={layout}
          theme={theme}
          onChange={handleSearch}
          onClear={() => setSearch("")}
          onRefresh={() => { refresh(); trackEvent(EVENTS.REFRESH) }}
          onLayoutChange={setLayout}
          onThemeToggle={toggleTheme}
        />
      )}

      {/* ── Filter rows: Resource + Storage ──────────────────────────────── */}
      {FEATURES.sourceFilter && FEATURES.storageFilter && (
        <Filters
          sourceFilter={sourceFilter}
          storageFilter={storageFilter}
          onSourceChange={(v) => {
            setSourceFilter(v)
            trackEvent(EVENTS.FILTER_SOURCE, { value: v })
          }}
          onStorageChange={(v) => {
            setStorageFilter(v)
            trackEvent(EVENTS.FILTER_STORAGE, { value: v })
          }}
          countFor={countFor}
          storageCountFor={storageCountFor}
        />
      )}

      {/* ── Asset grid / list ─────────────────────────────────────────────── */}
      <AssetGrid
        assets={filtered}
        loading={loading}
        loadError={loadError}
        sourceFilter={sourceFilter}
        hasSelection={hasSelection}
        addingKey={addingKey}
        addedKey={addedKey}
        layout={layout}
        onOpen={openDetail}
        onAdd={(a, e) => { e.stopPropagation(); doAdd(a) }}
        onRetry={refresh}
      />

      {/* ── Add toast ─────────────────────────────────────────────────────── */}
      {addMode && (
        <div className={`add-toast ${addMode}`}>
          {addMode === "set" ? "✓ Set on selected frame" : "✓ Added to canvas"}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="footer-bar">
        <a className="footer-link" href="https://buymeacoffee.com/heyaghassi" target="_blank" rel="noreferrer">
          ☕ Buy me a coffee
        </a>
        <a className="footer-link" href="#" target="_blank" rel="noreferrer">
          Feature request/feedback 💬
        </a>
      </footer>

      {/* ── Detail panel ──────────────────────────────────────────────────── */}
      {selected && (
        <DetailPanel
          selected={selected}
          editingAlt={editingAlt}
          saving={saving}
          saveSuccess={saveSuccess}
          addingKey={addingKey}
          addedKey={addedKey}
          addMode={addMode}
          hasSelection={hasSelection}
          navIndex={navIndex}
          nodePageNames={nodePageNames}
          onClose={() => setSelected(null)}
          onAltChange={(v) => { setEditingAlt(v); setSaveSuccess(false) }}
          onSaveAlt={handleSaveAlt}
          onAdd={() => doAdd(selected)}
          onStepNav={(d) => {
            if (d === -1) stepPrev(); else stepNext()
            trackEvent(EVENTS.NAVIGATE_USAGE, { direction: d === -1 ? "prev" : "next" })
          }}
          onNavToIndex={navToIndex}
          onNavToCurrent={navToCurrentNode}
        />
      )}
    </div>
  )
}
