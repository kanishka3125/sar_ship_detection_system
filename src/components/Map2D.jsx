import { useEffect, useRef, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap, Tooltip, useMapEvents, Marker, Polyline, LayerGroup, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { validateCoords } from '../utils/timeUtils'
import { RESTRICTED_ZONES } from '../data/zones'

const RISK_COLORS = { HIGH: 'var(--danger)', MEDIUM: 'var(--warning)', LOW: '#94a3b8' }

/* Build clean, professional CSS-animated DivIcon per ship */
function makeShipIcon(ship, environment) {
  const isViolation = ship.isViolation
  const color = isViolation ? 'var(--danger)' : RISK_COLORS[ship.risk]
  const size = 12

  const pulseRings = ''

  const innerShape = `
    <div style="
      position:absolute;top:50%;left:50%;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50%;
      transform:translate(-50%,-50%);
      box-shadow:0 2px 4px rgba(0,0,0,0.3);
      border: 1.5px solid #ffffff;
    "></div>
  `

  const weatherIcon = (ship.env && environment?.weatherEnabled) ? `
    <div style="
      position:absolute; top:-12px; right:-12px;
      font-size:14px; background:rgba(0,0,0,0.6);
      width:20px; height:20px; border-radius:50%;
      display:flex; alignItems:center; justifyContent:center;
      box-shadow:0 0 5px rgba(0,0,0,0.5);
      border:1px solid rgba(255,255,255,0.2);
    ">${ship.env.icon}</div>
  ` : ''

  const html = `
    <style>
      .ship-tooltip {
        background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color);
        padding: 4px 8px; border-radius: 4px; font-family: var(--font-main); font-size: 11px; font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
    </style>
    <div style="position:relative;width:${size * 3}px;height:${size * 3}px;" title="${ship.vessel_name}">
      ${pulseRings}
      ${innerShape}
      ${weatherIcon}
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
function InnerMap({ ships, onSelectShip, focusShip, environment, visible }) {
  const map = useMap()

  // IMPORTANT: Fix for the "blank screen" or gray tiles when switching views
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        map.invalidateSize()
      }, 100)
    }
  }, [visible, map])

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
      const icon = makeShipIcon(ship, environment)
      const marker = L.marker([lat, lng], { icon })

      const popupContent = document.createElement('div')
      popupContent.style.cssText = 'font-family:var(--font-main);min-width:220px;padding:4px;'

      const weatherInfo = ship.env ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);font-size:10px;color:var(--text-secondary);">
          <span>${ship.env.icon} ${ship.env.condition}</span>
          <span>🌡️ ${ship.env.temp}°C</span>
          <span>💨 ${ship.env.windSpeed}kt</span>
        </div>
      ` : ''

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
          ${weatherInfo}
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
  }, [validShips, onSelectShip, map, environment])

  return <FlyToShip focusShip={focusShip} />
}

/* ── View change listener for zoom-out transitions ── */
function MapEvents({ onViewChange, viewState }) {
  const map = useMapEvents({
    zoomend: () => {
      const zoom = map.getZoom()
      if (zoom <= 3 && onViewChange) {
        const center = map.getCenter()
        onViewChange({ center: [center.lat, center.lng], zoom: 3 })
      }
    }
  })

  // Smooth entry animation when switching from Globe
  useEffect(() => {
    if (viewState) {
      map.flyTo(viewState.center, viewState.zoom, { animate: true, duration: 1.5 })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function Map2D({ ships, alerts = [], clusters = [], onSelectShip, focusShip, environment, viewState, onViewChange, visible, theme = 'dark' }) {
  const [mapStyle, setMapStyle] = useState('map') // 'map' or 'satellite'
  const [expandedClusterId, setExpandedClusterId] = useState(null)

  const darkAlerts = useMemo(() => (alerts || []).filter(a => a.type === "DARK_VESSEL"), [alerts])
  const spoofAlerts = useMemo(() => (alerts || []).filter(a => a.type === "AIS_SPOOFING"), [alerts])
  const loiterAlerts = useMemo(() => (alerts || []).filter(a => a.type === "LOITERING"), [alerts])

  const darkIcon = L.divIcon({
    className: 'red-pulse',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  })

  const aisIcon = L.divIcon({
    className: 'marker-yellow',
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  })

  const sarIconStatic = L.divIcon({
    className: 'marker-red-static',
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  })

  const loiterIcon = L.divIcon({
    className: 'marker-amber',
    html: '<span style="pointer-events:none">⏱</span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  })

  const dotIcon = L.divIcon({
    className: 'detection-dot',
    iconSize: [6, 6],
    iconAnchor: [3, 3]
  })

  const isNight = environment?.time === 'night'

  // Google Maps Style Tiles
  const mapUrl = "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
  const satUrl = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" // Hybrid (Satellite + Labels)
  const mapAttr = '&copy; Google Maps'
  const satAttr = '&copy; Google Maps Satellite'

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

        /* Zone labels — compact by default, hover expands */
        .zone-label-tooltip {
          background: rgba(10, 14, 26, 0.72) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          padding: 3px 8px !important;
          font-family: var(--font-mono) !important;
          font-size: 9px !important;
          font-weight: 600 !important;
          letter-spacing: 0.8px !important;
          color: rgba(255,255,255,0.75) !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          cursor: default;
          max-width: 90px;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: max-width 0.25s ease, background 0.2s;
        }
        .zone-label-tooltip:hover {
          max-width: 240px;
          background: rgba(10, 14, 26, 0.92) !important;
          color: #fff !important;
          border-color: rgba(255,255,255,0.25) !important;
        }
        .leaflet-tooltip-left.zone-label-tooltip::before  { border-left-color:  rgba(255,255,255,0.12) !important; }
        .leaflet-tooltip-right.zone-label-tooltip::before { border-right-color: rgba(255,255,255,0.12) !important; }
        .leaflet-tooltip-top.zone-label-tooltip::before   { border-top-color:   rgba(255,255,255,0.12) !important; }
        .leaflet-tooltip-bottom.zone-label-tooltip::before{ border-bottom-color:rgba(255,255,255,0.12) !important; }
      `}</style>

      {/* Map Style Toggle */}
      <div style={{
        position: 'absolute', top: '16px', right: '16px', zIndex: 1000,
        display: 'flex', gap: '8px', background: 'var(--bg-overlay)',
        padding: '4px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)',
        backdropFilter: 'blur(8px)', boxShadow: 'var(--shadow)',
      }}>
        <button
          onClick={() => setMapStyle('map')}
          title="Street Map"
          style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px',
            cursor: 'pointer', border: 'none', transition: 'all 0.2s',
            fontFamily: 'var(--font-main)',
            background: mapStyle === 'map' ? 'var(--accent)' : 'transparent',
            color: mapStyle === 'map' ? 'var(--bg-primary)' : 'var(--text-secondary)',
          }}
        >Map</button>
        <button
          onClick={() => setMapStyle('satellite')}
          title="Satellite View"
          style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px',
            cursor: 'pointer', border: 'none', transition: 'all 0.2s',
            fontFamily: 'var(--font-main)',
            background: mapStyle === 'satellite' ? 'var(--accent)' : 'transparent',
            color: mapStyle === 'satellite' ? 'var(--bg-primary)' : 'var(--text-secondary)',
          }}
        >Satellite</button>
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
        center={viewState?.center || [11.5, 79.0]}
        zoom={viewState?.zoom || 7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        preferCanvas={true}
        zoomAnimation={true}
      >
        <MapEvents onViewChange={onViewChange} viewState={viewState} />
        {mapStyle === 'map' ? (
          <TileLayer
            key="osm-tiles"
            url={mapUrl}
            attribution={mapAttr}
            maxZoom={22}
            maxNativeZoom={19}
            className="map-tiles-transition"
          />
        ) : (
          <TileLayer
            key="esri-tiles"
            url={satUrl}
            attribution={satAttr}
            maxZoom={22}
            maxNativeZoom={17}
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
              fillOpacity: 0.03,
              weight: 1,
              lineCap: 'round',
              dashArray: '4 4',
            }}
          >
            <Tooltip
              permanent
              direction={zone.labelDirection || 'center'}
              offset={zone.labelOffset || [0, 0]}
              className="zone-label-tooltip"
            >
              {zone.labelShort || zone.name}
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
          <InnerMap ships={ships} onSelectShip={onSelectShip} focusShip={focusShip} environment={environment} visible={visible} />
        )}

        {/* Dark Vessel Alerts Markers */}
        {darkAlerts.map((alert, idx) => (
          <Marker
            key={`dark-alt-${idx}`}
            position={[alert.lat, alert.lng]}
            icon={darkIcon}
            eventHandlers={{
              click: () => {
                const matchingShip = ships.find(s => s.id === alert.vessel_id)
                if (matchingShip) onSelectShip(matchingShip)
              }
            }}
          >
            <Tooltip permanent direction="top" className="ship-tooltip">
              DARK VESSEL ALERT
            </Tooltip>
            <Popup>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                <b style={{ color: '#ff2d55' }}>DARK VESSEL DETECTED</b><br />
                ID: {alert.vessel_id || alert.alert_id}<br />
                {alert.message}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* AIS Spoofing Alerts (Pairs + Logic) */}
        {spoofAlerts.map((alert, idx) => (
          <LayerGroup key={`spoof-group-${idx}`}>
            <Marker position={[alert.ais_lat, alert.ais_lon]} icon={aisIcon}>
              <Tooltip>AIS Reported Position</Tooltip>
            </Marker>
            <Marker position={[alert.sar_lat, alert.sar_lon]} icon={sarIconStatic}>
              <Tooltip>Actual SAR Detection</Tooltip>
            </Marker>
            <Polyline
              positions={[[alert.ais_lat, alert.ais_lon], [alert.sar_lat, alert.sar_lon]]}
              pathOptions={{ color: 'orange', dashArray: '6 4', weight: 2 }}
            >
              <Tooltip sticky>
                Deviation: {alert.delta_km} km
              </Tooltip>
            </Polyline>
          </LayerGroup>
        ))}

        {/* Loitering Alerts (Amber + Clock) */}
        {loiterAlerts.map((alert, idx) => (
          <Marker
            key={`loiter-alt-${idx}`}
            position={[alert.lat, alert.lng]}
            icon={loiterIcon}
            eventHandlers={{
              click: () => {
                const matchingShip = ships.find(s => s.id === alert.vessel_id)
                if (matchingShip) onSelectShip(matchingShip)
              }
            }}
          >
            <Tooltip permanent direction="top" className="ship-tooltip">
              {alert.duration} min stationary
            </Tooltip>
            <Popup>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                <b style={{ color: '#ffb830' }}>LOITERING DETECTED</b><br />
                ID: {alert.vessel_id}<br />
                {alert.message}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Intelligence Cluster Circles */}
        {clusters.map((cluster) => {
          const isExpanded = expandedClusterId === cluster.id
          const labelIcon = L.divIcon({
            className: 'cluster-label-div',
            html: `<span class="cluster-label-text">${cluster.vessel_count}</span>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })

          return (
            <LayerGroup key={`cluster-${cluster.id}`}>
              <Circle
                center={cluster.center}
                radius={cluster.vessel_count * 350} // Scale radius with count
                pathOptions={{
                  color: 'orange',
                  fillColor: 'orange',
                  fillOpacity: isExpanded ? 0.4 : 0.2, // Darken when expanded
                  weight: isExpanded ? 3 : 1,
                  dashArray: isExpanded ? '' : '5, 5'
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    setExpandedClusterId(isExpanded ? null : cluster.id)
                  }
                }}
              >
                <Tooltip direction="top">Suspicious Vessel Grouping ({cluster.vessel_count} ships)</Tooltip>
              </Circle>

              {/* Cluster Count Label */}
              <Marker position={cluster.center} icon={labelIcon} interactive={false} />

              {/* Drill-Down Detections (White Dots) */}
              {isExpanded && cluster.detections && cluster.detections.map((det, dIdx) => (
                <Marker key={`${cluster.id}-det-${dIdx}`} position={det} icon={dotIcon} interactive={false} />
              ))}
            </LayerGroup>
          )
        })}
      </MapContainer>
    </div>
  )
}
