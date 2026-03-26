import { useEffect, useRef, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { validateCoords } from '../utils/timeUtils'
import { RESTRICTED_ZONES } from '../data/zones'

const RISK_COLORS = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }
const RISK_GLOW = { HIGH: 'rgba(255, 45, 85, 0.4)', MEDIUM: 'rgba(255, 184, 48, 0.3)', LOW: 'rgba(0, 230, 118, 0.3)' }

/* Build clean, professional CSS-animated DivIcon per ship */
function makeShipIcon(ship) {
  const isViolation = ship.isViolation
  const color = isViolation ? '#ff2d55' : RISK_COLORS[ship.risk]
  const glow = isViolation ? 'rgba(255, 45, 85, 0.6)' : RISK_GLOW[ship.risk]
  const isHigh = ship.risk === 'HIGH' || isViolation
  const isMed = ship.risk === 'MEDIUM'
  const size = isViolation ? 18 : isHigh ? 16 : isMed ? 14 : 12

  const pulseRings = isHigh ? `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size * 2.8}px;height:${size * 2.8}px;
      border-radius:50%;border:2px solid ${color};
      transform:translate(-50%,-50%);
      animation:markerPulseClean ${isViolation ? '1s' : '2s'} ease-out infinite;
      opacity:0.6;
    "></div>
  ` : ''

  const innerShape = isHigh ? `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size}px;height:${size}px;
      background:${color};
      transform:translate(-50%,-50%) rotate(45deg);
      box-shadow:0 0 12px ${glow}, 0 0 20px ${glow}44;
      border: 1.5px solid #ffffff;
    "></div>
  ` : `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50%;
      transform:translate(-50%,-50%);
      box-shadow:0 2px 4px rgba(0,0,0,0.3), 0 0 6px ${glow};
      border: 1px solid #ffffff;
    "></div>
  `

  const html = `
    <style>
      @keyframes markerPulseClean{0%{transform:translate(-50%,-50%) scale(0.6);opacity:0.8}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}}
      .ship-tooltip {
        background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color);
        padding: 4px 8px; border-radius: 4px; font-family: var(--font-main); font-size: 11px; font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
    </style>
    <div style="position:relative;width:${size * 3}px;height:${size * 3}px;" title="${ship.vessel_name}">
      ${pulseRings}
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

/* ── Fly-to helper — only fires when focusShip changes ── */
function FlyToShip({ focusShip }) {
  const map = useMap()
  const prevId = useRef(null)
  useEffect(() => {
    if (focusShip && focusShip.id !== prevId.current) {
      const { lat, lng } = validateCoords(focusShip.lat, focusShip.lng)
      prevId.current = focusShip.id
      map.flyTo([lat, lng], 10, { duration: 1.3, easeLinearity: 0.25 })
    }
  }, [focusShip, map])
  return null
}

/* ── Inner map: stable markers, no random updates ── */
function InnerMap({ ships, onSelectShip, focusShip }) {
  const map = useMap()

  // Stable: only rebuild markers when ships array reference changes
  const validShips = useMemo(() =>
    ships.filter(s => {
      const { valid } = validateCoords(s.lat, s.lng)
      return valid
    }),
    [ships]
  )

  useEffect(() => {
    const markers = []
    validShips.forEach(ship => {
      const { lat, lng } = validateCoords(ship.lat, ship.lng)
      const color = RISK_COLORS[ship.risk]
      const icon = makeShipIcon(ship)
      const marker = L.marker([lat, lng], { icon })

      const popupContent = document.createElement('div')
      popupContent.style.cssText = 'font-family:var(--font-main);min-width:220px;padding:4px;'
      popupContent.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;padding:14px;color:var(--text-primary);box-shadow:0 8px 16px rgba(0,0,0,0.15);">
          <div style="color:var(--text-primary);font-weight:600;font-size:14px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
            <span>${ship.vessel_name}</span>
            <span style="background:${color}15;color:${color};padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;border:1px solid ${color}30;">${ship.risk} RISK</span>
          </div>
          <div style="color:var(--text-secondary);font-size:11px;font-family:var(--font-mono);margin-bottom:12px;border-bottom:1px solid var(--border-color);padding-bottom:8px;">
            MMSI: ${ship.mmsi}
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;">${ship.alert_reason.slice(0, 90)}…</div>
          <div style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono);background:var(--bg-secondary);padding:6px;border-radius:4px;">
            <div style="margin-bottom:3px;">LAT: ${lat.toFixed(4)}°N  LNG: ${lng.toFixed(4)}°E</div>
            <div>SPD: ${ship.speed_knots}kt | HDG: ${ship.heading}° | AIS: <span style="color:${ship.ais_status === 'ABSENT' ? '#d32f2f' : '#388e3c'};font-weight:600;">${ship.ais_status}</span></div>
          </div>
        </div>
      `
      const btn = document.createElement('button')
      btn.textContent = 'View Intelligence Profile'
      btn.style.cssText = `
        width:100%;padding:8px;cursor:pointer;border-radius:6px;font-size:11px;font-weight:600;
        font-family:var(--font-main);margin-top:8px;
        background:var(--cyan);color:#fff;border:none;transition:opacity 0.2s;
        box-shadow:0 2px 4px rgba(0,0,0,0.1);
      `
      btn.onmouseover = () => { btn.style.opacity = '0.9' }
      btn.onmouseout = () => { btn.style.opacity = '1' }
      btn.onclick = () => { onSelectShip(ship); marker.closePopup() }
      popupContent.querySelector('div').appendChild(btn)

      marker.bindPopup(L.popup({ maxWidth: 280, className: 'zenith-clean-popup', closeButton: false }).setContent(popupContent))
      
      // Add hover tooltip
      marker.bindTooltip(`<b>${ship.vessel_name}</b><br>${ship.vessel_type}`, {
        className: 'ship-tooltip', direction: 'top', offset: [0, -10]
      })

      marker.addTo(map)
      markers.push(marker)
    })

    return () => markers.forEach(m => m.remove())
  }, [validShips, onSelectShip, map])

  return <FlyToShip focusShip={focusShip} />
}

/* ── Main Map component ── */
export default function Map2D({ ships, onSelectShip, focusShip }) {
  const [mapStyle, setMapStyle] = useState('map') // 'map' or 'satellite'

  // OpenStreetMap Default Carto Light/Standard
  const mapUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  const mapAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  
  // Esri World Imagery (Satellite)
  const satUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
  const satAttr = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#eef2f9' }}>
      <style>{`
        .zenith-clean-popup .leaflet-popup-content-wrapper {
          background: transparent !important; border: none !important;
          box-shadow: none !important; padding: 0 !important;
        }
        .zenith-clean-popup .leaflet-popup-content { margin: 0 !important; }
        .zenith-clean-popup .leaflet-popup-tip-container { display: none; }
        
        /* Clean up zoom controls */
        .leaflet-control-zoom { border: none !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important; border-radius: 8px !important; overflow: hidden; }
        .leaflet-control-zoom a { background: var(--bg-card) !important; color: var(--text-primary) !important; border-color: var(--border-color) !important; width: 34px !important; height: 34px !important; line-height: 34px !important; }
        .leaflet-control-zoom a:hover { background: var(--bg-secondary) !important; }
      `}</style>

      {/* Map View Toggle Layer Control */}
      <div style={{
        position: 'absolute', top: '16px', right: '16px', zIndex: 1000,
        background: 'var(--bg-card)', borderRadius: '8px', padding: '4px',
        display: 'flex', gap: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid var(--border-color)',
      }}>
        <button
          onClick={() => setMapStyle('map')}
          style={{
            padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)',
            background: mapStyle === 'map' ? 'var(--cyan)' : 'transparent',
            color: mapStyle === 'map' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.2s ease'
          }}
        >
          Map View
        </button>
        <button
          onClick={() => setMapStyle('satellite')}
          style={{
            padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-main)',
            background: mapStyle === 'satellite' ? 'var(--cyan)' : 'transparent',
            color: mapStyle === 'satellite' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.2s ease'
          }}
        >
          Satellite View
        </button>
      </div>

      {!ships || ships.length === 0 ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📡</span>
            <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px' }}>NO VESSELS DETECTED</span>
          </div>
        </div>
      ) : null}

      <MapContainer
        center={[11.5, 79.0]}
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        preferCanvas={true}
        zoomAnimation={true}
      >
        {mapStyle === 'map' ? (
          <TileLayer
            key="osm-tiles"
            url={mapUrl}
            attribution={mapAttr}
            maxZoom={19}
            className="map-tiles-transition"
          />
        ) : (
          <TileLayer
            key="esri-tiles"
            url={satUrl}
            attribution={satAttr}
            maxZoom={20}
            className="map-tiles-transition"
          />
        )}
        
        {/* Restricted Zones */}
        {RESTRICTED_ZONES.map((zone, i) => (
          <Polygon
            key={zone.id || i}
            positions={zone.positions}
            pathOptions={{ 
              color: zone.color, 
              fillColor: zone.color, 
              fillOpacity: 0.1, 
              weight: 2.5, 
              dashArray: '6,6',
              lineCap: 'round'
            }}
          >
            <Tooltip permanent direction="center" className="zone-label-tooltip">
              {zone.name}
            </Tooltip>
            <Popup className="zenith-clean-popup">
              <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-main)', fontSize: '12px', fontWeight: 600, border: `1px solid ${zone.color}60`, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                <div style={{ color: zone.color, marginBottom: '4px', fontSize: '10px', letterSpacing: '1px' }}>RESTRICTED AREA identified</div>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>{zone.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400, borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                  Unauthorized entry triggers automated high-risk maritime alert.
                </div>
              </div>
            </Popup>
          </Polygon>
        ))}
        {ships && ships.length > 0 && (
          <InnerMap ships={ships} onSelectShip={onSelectShip} focusShip={focusShip} />
        )}
      </MapContainer>
    </div>
  )
}
