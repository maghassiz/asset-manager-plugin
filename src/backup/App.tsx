import { useEffect, useState } from "react"
import { framer } from "framer-plugin"
import "./App.css"

framer.showUI({ title: "Asset Manager", width: 320, height: 620, resizable: true })

// ─── Types ────────────────────────────────────────────────────────────────────
type AssetSource  = "canvas" | "cms"
type AssetType    = "image" | "video"
type SourceFilter = "all" | "canvas" | "cms"

interface AssetEntry {
  key:           string
  name:          string
  url:           string
  altText:       string
  source:        AssetSource
  assetType:     AssetType
  nodeIds:       string[]
  locationLabel: string
  navigateId?:   string
  cmsCollectionId?: string
  cmsItemId?:    string
}

// ─── Read backgroundImage shape safely ───────────────────────────────────────
function readImageData(raw: unknown): { url: string; altText: string; name: string } | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  // Handle typed shape: { type: "image", value: { url, altText, name } }
  const img = ("value" in obj && obj.value && typeof obj.value === "object")
    ? (obj.value as Record<string, unknown>) : obj
  const url = (img["url"] ?? img["src"] ?? "") as string
  if (!url) return null
  return {
    url,
    altText: (img["altText"] ?? "") as string,
    name:    (img["name"]    ?? "") as string,
  }
}

// ─── Detect if a URL is a video ───────────────────────────────────────────────
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|ogv|m4v|avi)(\?|$)/i.test(url)
}

// ─── Load all assets ──────────────────────────────────────────────────────────
async function loadAssets(): Promise<AssetEntry[]> {
  const entries: AssetEntry[] = []

  // ── 1. Canvas images via backgroundImage ─────────────────────────────────
  try {
    const nodes = await framer.getNodesWithAttributeSet("backgroundImage")

    // Normalize URL: strip query params so the same image used across breakpoints
    // (Desktop / Tablet / Phone replicas) deduplicates correctly.
    // Framer CDN URLs can have different ?scale= / ?compress= suffixes for the
    // same underlying asset. The asset "id" field is most reliable when present.
    const normalizeUrl = (url: string) => url.split("?")[0].split("#")[0]

    const grouped = new Map<string, {
      nodeIds: string[]
      url: string; name: string; altText: string
    }>()

    for (const node of nodes) {
      const raw  = (node as Record<string, unknown>)["backgroundImage"]
      const data = readImageData(raw)
      if (!data?.url) continue

      const rawObj = raw as Record<string, unknown>
      // Use Framer asset id when present (most stable key).
      // Fall back to normalized URL (strips query params) so breakpoint replicas
      // of the same image merge into one entry instead of showing as duplicates.
      const canonicalKey = (typeof rawObj["id"] === "string" && rawObj["id"])
        ? rawObj["id"] as string
        : normalizeUrl(data.url)

      const existing = grouped.get(canonicalKey)
      if (existing) {
        if (!existing.nodeIds.includes(node.id)) existing.nodeIds.push(node.id)
        // Prefer a real name over Untitled if we find one later
        if (existing.name === "Untitled" && data.name) existing.name = data.name
      } else {
        grouped.set(canonicalKey, {
          nodeIds: [node.id],
          url:     data.url,
          name:    data.name || "Untitled",
          altText: data.altText,
        })
      }
    }

    for (const [imageId, info] of grouped) {
      entries.push({
        key:           `canvas:${imageId}`,
        name:          info.name,
        url:           info.url,
        altText:       info.altText,
        source:        "canvas",
        assetType:     isVideoUrl(info.url) ? "video" : "image",
        nodeIds:       info.nodeIds,
        locationLabel: `${info.nodeIds.length} node${info.nodeIds.length !== 1 ? "s" : ""}`,
        navigateId:    info.nodeIds[0],
      })
    }
  } catch (e) { console.warn("[AM] canvas images:", e) }

  // ── 2. Video assets from ComponentInstanceNodes ──────────────────────────
  // How it works (based on the official Framer Assets docs):
  // Framer's Video component is a ComponentInstanceNode. When you add one,
  // it stores the video as a FileAsset inside `controls`:
  //   controls: { srcType: "Upload", srcFile: { url, name, mimeType } }
  //   controls: { srcType: "Link",   srcLink: "https://..." }
  //
  // Additionally, any custom CodeComponent using ControlType.File exposes
  // the uploaded file as a direct URL string in its controls:
  //   controls: { myVideoFile: "https://framerusercontent.com/...video.mp4" }
  //
  // We scan ALL ComponentInstanceNodes using getNodesWithAttributeSet("controls")
  // and inspect each controls object for video-shaped values.
  try {
    const compNodes = await framer.getNodesWithAttributeSet("controls")
    const videoGrouped = new Map<string, { nodeIds: string[]; name: string }>()

    for (const node of compNodes) {
      const rec      = node as Record<string, unknown>
      const controls = rec["controls"] as Record<string, unknown> | undefined
      if (!controls || typeof controls !== "object") continue

      let videoUrl  = ""
      let videoName = ""

      // ── Pattern A: Framer built-in Video component ─────────────────────────
      // { srcType: "Upload", srcFile: FileAsset } or { srcType: "Link", srcLink }
      const srcType = controls["srcType"] as string | undefined
      if (srcType === "Upload") {
        const f = controls["srcFile"] as Record<string, unknown> | undefined
        if (f && typeof f["url"] === "string") {
          const mime = (f["mimeType"] as string | undefined) ?? ""
          if (mime.startsWith("video/") || isVideoUrl(f["url"])) {
            videoUrl  = f["url"]
            videoName = (f["name"] as string | undefined) ?? "Video"
          }
        }
      } else if (srcType === "Link") {
        const link = controls["srcLink"] as string | undefined
        if (link && isVideoUrl(link)) {
          videoUrl  = link
          videoName = link.split("/").pop()?.split("?")[0] ?? "Video"
        }
      }

      // ── Pattern B: Custom component with ControlType.File ─────────────────
      // File controls expose a direct URL string for the uploaded file
      if (!videoUrl) {
        for (const val of Object.values(controls)) {
          // Direct URL string (ControlType.File returns a plain URL)
          if (typeof val === "string" && isVideoUrl(val)) {
            videoUrl  = val
            videoName = val.split("/").pop()?.split("?")[0] ?? "Video"
            break
          }
          // FileAsset object shape
          if (val && typeof val === "object") {
            const fa   = val as Record<string, unknown>
            const fUrl = fa["url"] as string | undefined
            if (!fUrl) continue
            const mime = (fa["mimeType"] as string | undefined) ?? ""
            if (mime.startsWith("video/") || isVideoUrl(fUrl)) {
              videoUrl  = fUrl
              videoName = (fa["name"] as string | undefined) ?? "Video"
              break
            }
          }
        }
      }

      if (!videoUrl) continue

      const existing = videoGrouped.get(videoUrl)
      if (existing) {
        if (!existing.nodeIds.includes(node.id)) existing.nodeIds.push(node.id)
      } else {
        videoGrouped.set(videoUrl, { nodeIds: [node.id], name: videoName })
      }
    }

    for (const [url, info] of videoGrouped) {
      if (entries.some((e) => e.url === url)) continue
      entries.push({
        key:           `video:${url}`,
        name:          info.name,
        url,
        altText:       "",
        source:        "canvas",
        assetType:     "video",
        nodeIds:       info.nodeIds,
        locationLabel: `${info.nodeIds.length} node${info.nodeIds.length !== 1 ? "s" : ""}`,
        navigateId:    info.nodeIds[0],
      })
    }
  } catch (e) { console.warn("[AM] videos:", e) }

  // ── 3. CMS images ─────────────────────────────────────────────────────────
  try {
    const collections = await framer.getCollections()
    for (const col of collections) {
      const fields    = await col.getFields()
      const imgFields = fields.filter((f) => f.type === "image")
      if (!imgFields.length) continue
      const items = await col.getItems()
      for (const item of items) {
        for (const field of imgFields) {
          const raw  = (item.fieldData as Record<string, unknown>)[field.id]
          const data = readImageData(raw)
          if (!data?.url) continue
          const slug = (item as Record<string, unknown>)["slug"] as string | undefined
          entries.push({
            key:             `cms:${col.id}:${item.id}:${field.id}`,
            name:            field.name,
            url:             data.url,
            altText:         data.altText,
            source:          "cms",
            assetType:       "image",
            nodeIds:         [],
            locationLabel:   `${col.name} › ${slug ?? item.id}`,
            cmsCollectionId: col.id,
            cmsItemId:       item.id,
          })
        }
      }
    }
  } catch (e) { console.warn("[AM] cms:", e) }

  return entries
}

// ─── Smart add to canvas ──────────────────────────────────────────────────────
async function smartAdd(asset: AssetEntry): Promise<"set" | "add"> {
  const sel = await framer.getSelection()
  if (sel.length > 0) {
    await framer.setImage({
      image:   asset.url,
      altText: asset.altText || undefined,
    } as Parameters<typeof framer.setImage>[0])
    return "set"
  }
  await framer.addImage({
    image:   asset.url,
    name:    asset.name,
    altText: asset.altText || undefined,
  } as Parameters<typeof framer.addImage>[0])
  return "add"
}

// ─── Save canvas alt text ─────────────────────────────────────────────────────
async function saveCanvasAltText(nodeIds: string[], newAlt: string) {
  for (const id of nodeIds) {
    const node = await framer.getNode(id)
    if (!node) continue
    const img = (node as Record<string, unknown>)["backgroundImage"] as Record<string, unknown> | null
    if (!img || typeof img["cloneWithAttributes"] !== "function") continue
    const cloned = (img["cloneWithAttributes"] as (a: Record<string, unknown>) => unknown)({ altText: newAlt })
    await (node as { setAttributes(a: Record<string, unknown>): Promise<void> }).setAttributes({ backgroundImage: cloned })
  }
}

// ─── Save CMS alt text ────────────────────────────────────────────────────────
async function saveCmsAltText(key: string, newAlt: string) {
  const parts = key.split(":")
  const colId  = parts[1]
  const itemId = parts[2]
  const fieldId = parts.slice(3).join(":")
  const cols  = await framer.getCollections()
  const col   = cols.find((c) => c.id === colId)
  if (!col) throw new Error("Collection not found")
  const items = await col.getItems()
  const item  = items.find((i) => i.id === itemId)
  if (!item) throw new Error("Item not found")
  const raw = (item.fieldData as Record<string, unknown>)[fieldId]
  if (!raw) throw new Error("Field not found")
  const updated = (typeof raw === "object" && raw !== null && "value" in raw)
    ? { ...(raw as object), value: { ...((raw as { value: object }).value), altText: newAlt } }
    : { ...(raw as object), altText: newAlt }
  const newFD = { ...(item.fieldData as Record<string, unknown>), [fieldId]: updated }
  const slug  = (item as Record<string, unknown>)["slug"] as string | undefined
  await (col as unknown as {
    addItems(items: { id: string; slug: string; fieldData: Record<string, unknown> }[]): Promise<void>
  }).addItems([{ id: itemId, slug: slug ?? itemId, fieldData: newFD }])
}

// ─── VideoThumb ───────────────────────────────────────────────────────────────
function VideoThumb({ url, className }: { url: string; className?: string }) {
  return (
    <video
      src={url}
      className={className ?? ""}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => { (e.currentTarget as HTMLVideoElement).currentTime = 1 }}
      onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
      onMouseLeave={(e) => {
        const v = e.currentTarget as HTMLVideoElement
        v.pause(); v.currentTime = 1
      }}
    />
  )
}

// ─── AssetCard ────────────────────────────────────────────────────────────────
function AssetCard({ asset, hasSelection, onOpen, onAdd, adding, justAdded }: {
  asset: AssetEntry
  hasSelection: boolean
  onOpen: () => void
  onAdd: (e: React.MouseEvent) => void
  adding: boolean
  justAdded: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`asset-card${hovered ? " hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div className="card-img-wrap" onClick={onOpen}>
        {asset.assetType === "video"
          ? <VideoThumb url={asset.url} className="card-img" />
          : <img
              src={asset.url}
              alt={asset.altText}
              loading="lazy"
              className="card-img"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = ".25" }}
            />
        }

        {/* Top-left: source */}
        <span className={`card-badge source-${asset.source}`}>{asset.source}</span>

        {/* Top-right: VIDEO label or usage count */}
        {asset.assetType === "video"
          ? <span className="card-badge badge-tr badge-video">▶ VIDEO</span>
          : asset.source === "canvas" && (
              <span className={`card-badge badge-tr badge-count${asset.nodeIds.length > 5 ? " hot" : ""}`}>
                ×{asset.nodeIds.length}
              </span>
            )
        }

        {/* Bottom-right: missing alt warning */}
        {asset.assetType === "image" && !asset.altText && (
          <span className="card-badge badge-br badge-noalt">no alt</span>
        )}
      </div>

      {/* Footer */}
      <div className="card-footer">
        <div className="card-info" onClick={onOpen}>
          <div className="card-name">{asset.name}</div>
          <div className="card-loc">{asset.locationLabel}</div>
        </div>

        {/* Action button */}
        <button
          className={[
            "add-btn",
            adding    ? "loading"   : "",
            justAdded ? "success"   : "",
            asset.assetType === "video" ? "video-btn"
              : hasSelection ? "set-btn" : "",
          ].filter(Boolean).join(" ")}
          onClick={onAdd}
          disabled={adding}
          title={
            asset.assetType === "video" ? "Go to video on canvas"
              : hasSelection ? "Set image on selected frame"
              : "Add image to canvas"
          }
        >
          {adding
            ? <span className="btn-spinner" />
            : justAdded
              ? "✓"
              : asset.assetType === "video"
                ? "↗"
                : hasSelection ? "↙" : "+"
          }
        </button>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ sourceFilter }: { sourceFilter: SourceFilter }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">⊡</div>
      <div className="empty-title">No assets found</div>
      <div className="empty-sub">
        {sourceFilter === "all"
          ? "This project has no assets yet"
          : `No ${sourceFilter} assets found`}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export function App() {
  const [assets,       setAssets]       = useState<AssetEntry[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [search,       setSearch]       = useState("")
  const [hasSelection, setHasSelection] = useState(false)
  const [selected,     setSelected]     = useState<AssetEntry | null>(null)
  const [editingAlt,   setEditingAlt]   = useState("")
  const [saving,       setSaving]       = useState(false)
  const [saveSuccess,  setSaveSuccess]  = useState(false)
  const [addingKey,    setAddingKey]    = useState<string | null>(null)
  const [addedKey,     setAddedKey]     = useState<string | null>(null)
  const [addMode,      setAddMode]      = useState<"set" | "add" | null>(null)

  // Track canvas selection to show correct add/set mode
  useEffect(() => framer.subscribeToSelection((s) => setHasSelection(s.length > 0)), [])

  const refresh = () => {
    setLoading(true)
    setLoadError(null)
    loadAssets()
      .then(setAssets)
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = assets.filter((a) => {
    if (sourceFilter !== "all" && a.source !== sourceFilter) return false
    if (search.trim() && !a.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const countFor = (f: SourceFilter) =>
    f === "all" ? assets.length : assets.filter((a) => a.source === f).length

  // ── Detail panel ──────────────────────────────────────────────────────────
  const openDetail  = (a: AssetEntry) => { setSelected(a); setEditingAlt(a.altText); setSaveSuccess(false) }
  const closeDetail = () => setSelected(null)

  const handleSaveAlt = async () => {
    if (!selected) return
    setSaving(true); setSaveSuccess(false)
    try {
      if (selected.source === "canvas") await saveCanvasAltText(selected.nodeIds, editingAlt)
      else await saveCmsAltText(selected.key, editingAlt)
      setAssets((prev) => prev.map((a) => a.key === selected.key ? { ...a, altText: editingAlt } : a))
      setSelected((prev) => prev ? { ...prev, altText: editingAlt } : null)
      setSaveSuccess(true)
    } catch (e) { alert(`Save failed: ${e}`) }
    finally { setSaving(false) }
  }

  const handleNavigate = async () => {
    if (!selected) return
    if (selected.navigateId) {
      await framer.setSelection([selected.navigateId])
      await framer.zoomIntoView([selected.navigateId])
    } else if (selected.cmsItemId) {
      await framer.navigateTo(selected.cmsItemId)
    }
  }

  const doAdd = async (asset: AssetEntry) => {
    // For videos: just navigate to the node on canvas
    if (asset.assetType === "video") {
      if (asset.navigateId) {
        await framer.setSelection([asset.navigateId])
        await framer.zoomIntoView([asset.navigateId])
      }
      return
    }
    setAddingKey(asset.key)
    try {
      const mode = await smartAdd(asset)
      setAddMode(mode)
      setAddedKey(asset.key)
      setTimeout(() => { setAddedKey(null); setAddMode(null); refresh() }, 1400)
    } catch (err) {
      alert(`Could not add to canvas: ${err}`)
    } finally {
      setAddingKey(null)
    }
  }

  return (
    <div className="plugin-root">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-logo">
          <span className="logo-mark">A</span>
          <div>
            <div className="header-title">Asset Manager</div>
            <div className="header-sub">FRAMER PLUGIN</div>
          </div>
        </div>

        {/* Live selection mode pill */}
        <div className={`sel-pill${hasSelection ? " active" : ""}`}>
          {hasSelection ? "↙ set on frame" : "+ add to canvas"}
        </div>

        <button className="refresh-btn" onClick={refresh} title="Refresh assets">↻</button>
      </header>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          placeholder="Search assets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="clear-btn" onClick={() => setSearch("")}>✕</button>
        )}
      </div>

      {/* ── Source filter ──────────────────────────────────────────────────── */}
      <div className="filter-row">
        {(["all", "canvas", "cms"] as SourceFilter[]).map((f) => (
          <button
            key={f}
            className={`filter-tab${sourceFilter === f ? " active" : ""}`}
            onClick={() => setSourceFilter(f)}
          >
            {f.toUpperCase()}
            <span className="filter-count">{countFor(f)}</span>
          </button>
        ))}
      </div>

      {/* ── Asset grid ─────────────────────────────────────────────────────── */}
      <div className="grid-area">
        {loading ? (
          <div className="state-msg">
            <div className="spinner" />
            Loading assets…
          </div>
        ) : loadError ? (
          <div className="state-msg error">
            <div>⚠ {loadError}</div>
            <button className="retry-btn" onClick={refresh}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState sourceFilter={sourceFilter} />
        ) : (
          <div className="asset-grid">
            {filtered.map((asset) => (
              <AssetCard
                key={asset.key}
                asset={asset}
                hasSelection={hasSelection}
                onOpen={() => openDetail(asset)}
                onAdd={(e) => { e.stopPropagation(); doAdd(asset) }}
                adding={addingKey === asset.key}
                justAdded={addedKey === asset.key}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Add toast ──────────────────────────────────────────────────────── */}
      {addMode && (
        <div className={`add-toast ${addMode}`}>
          {addMode === "set" ? "✓ Set on selected frame" : "✓ Added to canvas"}
        </div>
      )}

      {/* ── Detail panel ───────────────────────────────────────────────────── */}
      {selected && (
        <div className="overlay" onClick={closeDetail}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="panel-header">
              <span className="panel-title">{selected.name}</span>
              <button className="close-btn" onClick={closeDetail}>✕</button>
            </div>

            {/* Preview */}
            <div className="preview-wrap">
              {selected.assetType === "video"
                ? <VideoThumb url={selected.url} className="preview-media" />
                : <img
                    src={selected.url}
                    alt={selected.altText}
                    className="preview-media"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = ".25" }}
                  />
              }
              <span className={`detail-badge source-${selected.source}`}>{selected.source}</span>
              {selected.assetType === "video" && (
                <span className="detail-badge badge-video-detail">▶ VIDEO</span>
              )}
            </div>

            {/* Meta row */}
            <div className="meta-row">
              <div className="meta-box">
                <div className="meta-label">TYPE</div>
                <div className="meta-value">{selected.assetType.toUpperCase()}</div>
              </div>
              {selected.source === "canvas" && (
                <div className="meta-box">
                  <div className="meta-label">USAGE</div>
                  <div className={`meta-value${selected.nodeIds.length > 5 ? " hot" : ""}`}>
                    ×{selected.nodeIds.length} node{selected.nodeIds.length !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
            </div>

            {/* Location */}
            <div className="location-row">
              <span className="meta-label">LOCATION</span>
              <span className="location-tag">{selected.locationLabel}</span>
            </div>

            {/* Alt text — images only */}
            {selected.assetType === "image" && (
              <div className="alt-section">
                <div className="meta-label">ALT TEXT</div>
                <textarea
                  className="alt-input"
                  rows={3}
                  value={editingAlt}
                  onChange={(e) => { setEditingAlt(e.target.value); setSaveSuccess(false) }}
                  placeholder="Describe this image for accessibility…"
                />
                {saveSuccess && <div className="feedback-ok">✓ Alt text saved!</div>}
                {addedKey === selected.key && (
                  <div className="feedback-ok">
                    {addMode === "set" ? "✓ Set on selected frame!" : "✓ Added to canvas!"}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="actions-row">
              {selected.assetType === "image" && (
                <button className="btn-primary" onClick={handleSaveAlt} disabled={saving}>
                  {saving ? "Saving…" : "Save Alt Text"}
                </button>
              )}
              <button
                className={[
                  "btn-add",
                  selected.assetType === "video" ? "video-mode"
                    : hasSelection ? "set-mode" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => doAdd(selected)}
                disabled={addingKey === selected.key}
                title={
                  selected.assetType === "video" ? "Go to video node on canvas"
                    : hasSelection ? "Set on selected frame"
                    : "Add to canvas"
                }
              >
                {addingKey === selected.key
                  ? "…"
                  : selected.assetType === "video"
                    ? "↗ Go to"
                    : hasSelection ? "↙ Set on frame" : "+ Add to canvas"
                }
              </button>
              <button className="btn-nav" onClick={handleNavigate} title="Navigate to asset">↗</button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
