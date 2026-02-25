import { useState } from "react"

interface AssetEntry {
  key: string
  name: string
  url: string
  altText: string
  source: "canvas" | "cms"
  nodeIds: string[]
  locationLabel: string
  navigateId?: string
  cmsItemId?: string
}

interface AssetCardProps {
  asset: AssetEntry
  onClick: () => void
}

export function AssetCard({ asset, onClick }: AssetCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`asset-card ${hovered ? "hovered" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="card-img-wrap">
        <img
          className="card-img"
          src={asset.url}
          alt={asset.altText}
          loading="lazy"
        />
        <span className={`source-badge source-${asset.source}`}>{asset.source}</span>
        {asset.source === "canvas" && (
          <span className={`usage-badge ${asset.nodeIds.length > 5 ? "accent" : ""}`}>
            ×{asset.nodeIds.length}
          </span>
        )}
        {!asset.altText && <span className="no-alt-badge">no alt</span>}
      </div>
      <div className="card-info">
        <div className="card-name">{asset.name}</div>
        <div className="card-loc">{asset.locationLabel}</div>
      </div>
    </div>
  )
}
