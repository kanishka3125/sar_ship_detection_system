import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const RISK_COLORS = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }
const RISK_GLOW   = { HIGH: 'rgba(255,45,85,0.65)', MEDIUM: 'rgba(255,184,48,0.5)', LOW: 'rgba(0,230,118,0.4)' }

const ZONES = [
  { name: 'Naval Exclusion Zone — Kochi',     color: '#ff2d55', positions: [[9.5,76.0],[9.5,76.5],[10.3,76.5],[10.3,76.0]] },
  { name: 'EEZ Fishing Restriction Zone',     color: '#ffb830', positions: [[10.3,78.8],[10.3,79.8],[11.2,79.8],[11.2,78.8]] },
  { name: 'Port Exclusion Zone — Chennai',    color: '#4488ff', positions: [[12.8,80.0],[12.8,80.4],[13.2,80.4],[13.2,80.0]] },
]

/* Build rich CSS-animated DivIcon per ship */
function makeShipIcon(ship) {
  const color = RISK_COLORS[ship.risk]
  const glow  = RISK_GLOW[ship.risk]
  const isHigh = ship.risk === 'HIGH'
  const isMed  = ship.risk === 'MEDIUM'
  const size   = isHigh ? 20 : isMed ? 16 : 14

  const pulseRings = isHigh ? `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size * 2.8}px;height:${size * 2.8}px;
      border-radius:50%;border:2px solid ${color};
      transform:translate(-50%,-50%);
      animation:markerPulse1 1.5s ease-out infinite;
      opacity:0.7;
    "></div>
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size * 2.0}px;height:${size * 2.0}px;
      border-radius:50%;border:2px solid ${color};
      transform:translate(-50%,-50%);
      animation:markerPulse1 1.5s ease-out infinite 0.5s;
      opacity:0.5;
    "></div>
  ` : isMed ? `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size * 2.2}px;height:${size * 2.2}px;
      border-radius:50%;border:1.5px solid ${color};
      transform:translate(-50%,-50%);
      animation:markerPulse2 2.2s ease-out infinite;
      opacity:0.5;
    "></div>
  ` : ''

  // Ship icon: diamond shape for HIGH, circle for others
  const innerShape = isHigh ? `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size * 0.7}px;height:${size * 0.7}px;
      background:${color};
      transform:translate(-50%,-50%) rotate(45deg);
      box-shadow:0 0 ${size}px ${color},0 0 ${size * 2}px ${glow};
    "></div>
  ` : `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size * 0.7}px;height:${size * 0.7}px;
      background:${color};
      border-radius:50%;
      transform:translate(-50%,-50%);
      box-shadow:0 0 ${size}px ${color},0 0 ${size * 1.5}px ${glow};
    "></div>
  `

  const html = `
    <style>
      @keyframes markerPulse1{0%{transform:translate(-50%,-50%) scale(0.5);opacity:0.8}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}}
      @keyframes markerPulse2{0%{transform:translate(-50%,-50%) scale(0.6);opacity:0.6}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
    </style>
    <div style="position:relative;width:${size * 3}px;height:${size * 3}px;">
      ${pulseRings}
      <div style="
        position:absolute;top:50%;left:50%;
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:radial-gradient(circle, ${color}33 0%, transparent 70%);
        transform:translate(-50%,-50%);
      "></div>
      ${innerShape}
    </div>
  `

  return L.divIcon({
    html,
    className: '',
    iconSize: [size * 3, size * 3],
    iconAnchor: [(size * 3) / 2, (size * 3) / 2],
    popupAnchor: [0, -(size * 1.5)],
  })
}

/* ── Fly-to helper ── */
function FlyToShip({ focusShip }) {
  const map = useMap()
  useEffect(() => {
    if (focusShip) map.flyTo([focusShip.lat, focusShip.lng], 10, { duration: 1.2 })
  }, [focusShip, map])
  return null
}

/* ── Custom marker with interactivity ── */
function ShipMarker({ ship, onSelectShip }) {
  const markerRef = useRef(null)

  useEffect(() => {
    if (!markerRef.current) return
    const icon = makeShipIcon(ship)
    const marker = L.marker([ship.lat, ship.lng], { icon })
    markerRef.current.layerInstance = marker
    return () => marker.remove()
  }, [])

  return null  // Rendered via useEffect above
}

/* ── Main Map component ── */
function InnerMap({ ships, onSelectShip, focusShip }) {
  const map = useMap()

  useEffect(() => {
    // Clear old markers
    const markers = []
    ships.forEach(ship => {
      const color  = RISK_COLORS[ship.risk]
      const icon   = makeShipIcon(ship)
      const marker = L.marker([ship.lat, ship.lng], { icon })

      // Custom popup
      const popupContent = document.createElement('div')
      popupContent.style.cssText = `font-family:Space Grotesk,sans-serif;min-width:200px;`
      popupContent.innerHTML = `
        <div style="background:#0d1829;border:1px solid ${color}44;border-radius:8px;padding:12px;color:#e8f0fe;">
          <div style="color:${color};font-weight:700;font-size:14px;margin-bottom:4px;">${ship.vessel_name}</div>
          <div style="color:#7a95b8;font-size:11px;font-family:JetBrains Mono,monospace;margin-bottom:8px;">${ship.id} · MMSI ${ship.mmsi}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <span style="background:${color}22;color:${color};padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;border:1px solid ${color}44;">${ship.risk} RISK</span>
            <span style="background:rgba(0,212,255,0.1);color:#00d4ff;padding:2px 8px;border-radius:3px;font-size:10px;">AIS: ${ship.ais_status}</span>
          </div>
          <div style="font-size:11px;color:#7a95b8;margin-bottom:8px;line-height:1.4;">${ship.alert_reason.slice(0, 75)}…</div>
          <div style="font-size:10px;color:#7a95b8;font-family:JetBrains Mono,monospace;margin-bottom:8px;">${ship.lat.toFixed(4)}°N  ${ship.lng.toFixed(4)}°E | ${ship.speed_knots}kt | HDG ${ship.heading}°</div>
        </div>
      `
      const btn = document.createElement('button')
      btn.textContent = 'OPEN INTELLIGENCE PROFILE →'
      btn.style.cssText = `
        width:100%;padding:7px;cursor:pointer;border-radius:5px;font-size:11px;font-weight:700;
        font-family:Space Grotesk,sans-serif;letter-spacing:0.5px;margin-top:4px;
        background:${color}22;color:${color};border:1px solid ${color}44;
        transition:background 0.2s;
      `
      btn.onmouseover = () => { btn.style.background = `${color}44` }
      btn.onmouseout  = () => { btn.style.background = `${color}22` }
      btn.onclick = () => { onSelectShip(ship); marker.closePopup() }
      popupContent.appendChild(btn)

      marker.bindPopup(L.popup({
        maxWidth: 260,
        className: 'zenith-popup',
        closeButton: true,
      }).setContent(popupContent))

      marker.on('click', () => marker.openPopup())
      marker.addTo(map)
      markers.push(marker)
    })

    return () => markers.forEach(m => m.remove())
  }, [ships, onSelectShip, map])

  return <FlyToShip focusShip={focusShip} />
}

export default function Map2D({ ships, onSelectShip, focusShip }) {
  return (
    <>
      <style>{`
        .zenith-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .zenith-popup .leaflet-popup-content { margin: 0 !important; }
        .zenith-popup .leaflet-popup-tip-container { display: none; }
        .zenith-popup .leaflet-popup-close-button {
          color: #7a95b8 !important; font-size: 16px !important;
          top: 6px !important; right: 8px !important;
        }
      `}</style>
      <MapContainer
        center={[11.5, 79.0]}
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM &copy; CARTO'
          subdomains="abcd"
          maxZoom={19}
        />
        {/* Restricted Zones */}
        {ZONES.map((zone, i) => (
          <Polygon
            key={i}
            positions={zone.positions}
            pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.08, weight: 1.5, dashArray: '6,4' }}
          >
            <Popup>
              <div style={{ background: '#0d1829', padding: '8px 12px', borderRadius: '6px', color: zone.color, fontFamily: 'Space Grotesk,sans-serif', fontSize: '12px', fontWeight: 700 }}>
                ⚠ {zone.name}
              </div>
            </Popup>
          </Polygon>
        ))}
        <InnerMap ships={ships} onSelectShip={onSelectShip} focusShip={focusShip} />
      </MapContainer>
    </>
  )
}
