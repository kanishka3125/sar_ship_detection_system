import { useState, useCallback, useEffect, useMemo } from 'react'
import Navbar           from './components/Navbar.jsx'
import Map2D            from './components/Map2D.jsx'
import Globe3D          from './components/Globe3D.jsx'
import AlertsPanel      from './components/AlertsPanel.jsx'
import ShipModal        from './components/ShipModal.jsx'
import StatsBar         from './components/StatsBar.jsx'
import OnboardingOverlay from './components/OnboardingOverlay.jsx'

import shipsData  from './data/ships.json'
import alertsData from './data/alerts.json'
import { RESTRICTED_ZONES } from './data/zones'
import { findZoneViolation } from './utils/geoUtils'
import { getShipEnvironment, getSystemTimeMode } from './utils/envUtils'

const ONBOARDING_KEY = 'zenith_onboarding_done'
const THEME_KEY      = 'zenith_theme'

export default function App() {
  const [viewMode,      setViewMode]      = useState('2d')
  const [selectedShip,  setSelectedShip]  = useState(null)
  const [focusShip,     setFocusShip]     = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [theme,         setTheme]         = useState(
    () => localStorage.getItem(THEME_KEY) || 'dark'
  )

  // 1. Environment State
  const [environment, setEnvironment] = useState({
    time: getSystemTimeMode(), // 'day' | 'night'
    weatherEnabled: true,
    seaEnabled: true
  })

  // 2. View State (for sync between 2D and 3D)
  const [viewState, setViewState] = useState({
    center: [11.5, 79.0], // [lat, lng]
    zoom: 7
  })

  const handleViewTransition = useCallback((newMode, coords) => {
    if (coords) {
      setViewState(prev => ({ ...prev, center: coords.center || prev.center, zoom: coords.zoom || prev.zoom }))
    }
    setViewMode(newMode)
  }, [])

  // 1. Process ships for violations and 2. Generate dynamic alerts
  const { processedShips, mergedAlerts } = useMemo(() => {
    const dynamicViolations = []
    
    const ships = (shipsData || []).map(ship => {
      // Inject environment data
      const env = getShipEnvironment(ship.id)
      
      const violatedZone = findZoneViolation(ship.lat, ship.lng, RESTRICTED_ZONES)
      let isViolation = false
      let violatedZoneName = ''

      if (violatedZone) {
        const violationAlert = {
          alert_id: `AUTO-ALT-${ship.id}`,
          type: 'ZONE_VIOLATION',
          vessel_id: ship.id,
          vessel_name: ship.vessel_name,
          lat: ship.lat,
          lng: ship.lng,
          severity: 'HIGH',
          message: `CRITICAL: Vessel identified inside ${violatedZone.name}. Immediate identity verification required.`,
          timestamp: new Date().toISOString(),
          is_dynamic: true
        }
        dynamicViolations.push(violationAlert)
        isViolation = true
        violatedZoneName = violatedZone.name
      }
      
      // Update risk logic: Bad weather + No AIS = High Risk
      let riskVal = ship.risk
      if ((env.condition === 'Stormy' || env.seaState === 'Rough') && ship.ais_status === 'ABSENT' && riskVal !== 'HIGH') {
        riskVal = 'HIGH'
      }

      return { 
        ...ship, 
        isViolation, 
        violatedZoneName,
        env, // Attach environment data
        risk: riskVal
      }
    })

    // Combine static alerts with dynamic ones, avoiding duplicates for the same ship
    const combinedAlerts = [...dynamicViolations, ...alertsData].filter(
      (alert, index, self) => index === self.findIndex(a => a.vessel_id === alert.vessel_id)
    ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))

    return { processedShips: ships, mergedAlerts: combinedAlerts }
  }, [])

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }, [])

  // Show onboarding on first visit only
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setShowOnboarding(true)
    }
  }, [])

  const handleDismissOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
  }, [])

  const handleSelectShip = useCallback((ship) => {
    setSelectedShip(ship)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedShip(null)
  }, [])

  const handleAlertClick = useCallback((alert) => {
    const ship = processedShips.find(s => s.id === alert.vessel_id)
    if (ship) {
      setFocusShip(ship)
      setSelectedShip(ship)
      setTimeout(() => setFocusShip(null), 300)
    }
  }, [processedShips])

  const highCount  = processedShips.filter(s => s.risk === 'HIGH' || s.isViolation).length
  const alertCount = mergedAlerts.length

  return (
    <div
      data-theme={theme}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)', color: 'var(--text-primary)', transition: 'background 0.35s ease, color 0.35s ease' }}
    >
      {/* Navbar */}
      <Navbar
        viewMode={viewMode}
        totalShips={processedShips.length}
        highCount={highCount}
        alertCount={alertCount}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        environment={environment}
        setEnvironment={setEnvironment}
        onToggleView={(m) => handleViewTransition(m)}
      />

      {/* Main Content Row */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div 
            style={{ 
              position: 'absolute', inset: 0, 
              transition: 'opacity 1s ease-in-out', 
              opacity: viewMode === '2d' ? 1 : 0,
              zIndex: viewMode === '2d' ? 2 : 1,
              pointerEvents: viewMode === '2d' ? 'auto' : 'none'
            }}
          >
            <Map2D 
              ships={processedShips} 
              onSelectShip={handleSelectShip} 
              focusShip={focusShip} 
              environment={environment}
              viewState={viewState}
              onViewChange={(coords) => handleViewTransition('3d', coords)}
              visible={viewMode === '2d'}
            />
          </div>

          <div 
            style={{ 
              position: 'absolute', inset: 0, 
              transition: 'opacity 1s ease-in-out', 
              opacity: viewMode === '3d' ? 1 : 0,
              zIndex: viewMode === '3d' ? 2 : 1,
              pointerEvents: viewMode === '3d' ? 'auto' : 'none'
            }}
          >
            <Globe3D 
              ships={processedShips} 
              onSelectShip={handleSelectShip} 
              environment={environment}
              viewState={viewState}
              onViewChange={(coords) => handleViewTransition('2d', coords)}
              visible={viewMode === '3d'}
            />
          </div>

          {/* Overlay: View Mode Tag */}
          <div style={{
            position: 'absolute', bottom: '16px', left: '16px', zIndex: 500,
            background: 'rgba(4,8,20,0.90)', border: '1px solid rgba(0,212,255,0.14)',
            borderRadius: '6px', padding: '6px 12px',
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)',
            backdropFilter: 'blur(8px)', letterSpacing: '0.3px',
          }}>
            <span style={{ color: 'var(--cyan)' }}>●</span>{' '}
            {viewMode === '2d'
              ? 'LEAFLET 2D · SENTINEL-1 SAR OVERLAY'
              : 'THREE.JS 3D GLOBE · WEBGL ACCELERATED'}
          </div>
        </div>

        {/* Alerts Panel */}
        <AlertsPanel alerts={mergedAlerts} onAlertClick={handleAlertClick} />
      </div>

      {/* Stats Bar */}
      <StatsBar ships={processedShips} />

      {/* Ship Modal */}
      {selectedShip && (
        <ShipModal 
          ship={selectedShip} 
          environment={environment}
          onClose={handleCloseModal} 
        />
      )}

      {/* Onboarding Overlay */}
      {showOnboarding && <OnboardingOverlay onDismiss={handleDismissOnboarding} />}
    </div>
  )
}
