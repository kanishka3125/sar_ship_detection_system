import { useState, useCallback, Suspense } from 'react'
import Navbar      from './components/Navbar.jsx'
import Map2D       from './components/Map2D.jsx'
import Globe3D     from './components/Globe3D.jsx'
import AlertsPanel from './components/AlertsPanel.jsx'
import ShipModal   from './components/ShipModal.jsx'
import StatsBar    from './components/StatsBar.jsx'

import shipsData  from './data/ships.json'
import alertsData from './data/alerts.json'


export default function App() {
  const [viewMode,     setViewMode]     = useState('2d')
  const [selectedShip, setSelectedShip] = useState(null)
  const [focusShip,    setFocusShip]    = useState(null)

  const handleSelectShip = useCallback((ship) => {
    setSelectedShip(ship)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedShip(null)
  }, [])

  const handleAlertClick = useCallback((alert) => {
    const ship = shipsData.find(s => s.id === alert.vessel_id)
    if (ship) {
      setFocusShip(ship)
      setSelectedShip(ship)
      // Reset focus so next click on same ship still triggers flyTo
      setTimeout(() => setFocusShip(null), 200)
    }
  }, [])

  const highCount   = shipsData.filter(s => s.risk === 'HIGH').length
  const alertCount  = alertsData.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Navbar */}
      <Navbar
        viewMode={viewMode}
        onToggleView={setViewMode}
        totalShips={shipsData.length}
        highCount={highCount}
        alertCount={alertCount}
      />

      {/* Main Content Row */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map / Globe Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === '2d' ? (
            <Map2D
              ships={shipsData}
              onSelectShip={handleSelectShip}
              focusShip={focusShip}
            />
          ) : (
            <Globe3D ships={shipsData} onSelectShip={handleSelectShip} />
          )}


          {/* Overlay: View Mode Tag */}
          <div style={{
            position: 'absolute', bottom: '16px', left: '16px', zIndex: 500,
            background: 'rgba(6,11,24,0.88)', border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: '6px', padding: '6px 12px',
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ color: 'var(--cyan)' }}>●</span> {viewMode === '2d' ? 'LEAFLET 2D · SENTINEL-1 SAR OVERLAY' : 'THREE.JS 3D GLOBE · WEBGL ACCELERATED'}
          </div>
        </div>

        {/* Alerts Panel */}
        <AlertsPanel
          alerts={alertsData}
          onAlertClick={handleAlertClick}
        />
      </div>

      {/* Stats Bar */}
      <StatsBar ships={shipsData} />

      {/* Ship Modal */}
      {selectedShip && (
        <ShipModal ship={selectedShip} onClose={handleCloseModal} />
      )}
    </div>
  )
}
