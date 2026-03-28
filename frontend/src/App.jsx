import { useState, useCallback, useEffect, useMemo } from 'react'
import { runPipelineMulti } from './api'
import SARViewer from './components/SARViewer'
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
  const [isPanelOpen,   setIsPanelOpen]   = useState(false)
  const [theme,         setTheme]         = useState(
    () => localStorage.getItem(THEME_KEY) || 'light'
  )

  // 1. Environment State
  const [environment, setEnvironment] = useState({
    time: getSystemTimeMode(), // 'day' | 'night'
    weatherEnabled: true,
    seaEnabled: true
  })

  // 1.1 Alert & Cluster State (Live Feeds)
  const [liveAlerts, setLiveAlerts] = useState([])
  const [clusters,   setClusters]   = useState([])



  // 2. View State (for sync between 2D and 3D)
  const [viewState, setViewState] = useState({
    center: [11.5, 79.0], // [lat, lng]
    zoom: 7
  })
  const [backendData, setBackendData] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState([])

  const handleViewTransition = useCallback((newMode, coords) => {
    if (coords) {
      setViewState(prev => ({ ...prev, center: coords.center || prev.center, zoom: coords.zoom || prev.zoom }))
    }
    setViewMode(newMode)
  }, [])

  // 1. Process ships for violations and 2. Generate dynamic alerts
  const { processedShips, mergedAlerts } = useMemo(() => {
    const dynamicViolations = []
    
    const ships = (backendData?.vessel_reports?.length
     ? backendData.vessel_reports
     : shipsData
    ).map((item, index) => {
      
      let ship
      
      if (backendData?.vessel_reports?.length) {
        ship = {
          id: item.sar_det_id || index,
          lat: item.sar_coords?.lat,
          lng: item.sar_coords?.lon,
          vessel_name: item.ais_match?.name || "Unknown Vessel",
          risk: item.status === "DARK"
          ? "HIGH"
          : (item.confidence < 0.5 ? "MEDIUM" : "LOW"),
          ais_status: item.status === "DARK" ? "ABSENT" : "PRESENT",
          speed: item.ais_match?.speed_kts || 0,
          course: 0,
        };
      } else {
        ship = item
      }
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

    // Combine static alerts, dynamic zone violations, and live API alerts
    const allAlerts = backendData?.all_alerts?.length
    ? [...dynamicViolations, ...backendData.all_alerts]
    : [...dynamicViolations, ...alertsData]
    
    // De-duplicate by vessel or alert ID
    const combinedAlerts = allAlerts.filter(
      (alert, index, self) => index === self.findIndex(a => (a.vessel_id && a.vessel_id === alert.vessel_id) || (a.alert_id === alert.alert_id))
    ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))

    return { processedShips: ships, mergedAlerts: combinedAlerts }
  }, [backendData])

  console.log("Processed Ships:", processedShips)

  const loiteringCount = useMemo(() => 
    liveAlerts.filter(a => a.type === 'LOITERING').length, 
  [liveAlerts])

  const totalShips = processedShips.length
  const highRisk = processedShips.filter(s => s.risk === 'HIGH').length
  const darkVessels = processedShips.filter(s => s.ais_status === 'ABSENT').length
  const alertsCount = mergedAlerts.length


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
  const handleFileChange = (e) => {
  setSelectedFiles(Array.from(e.target.files))
}

const handleRun = async () => {
  if (selectedFiles.length !== 4) {
    alert("Please upload exactly 4 images")
    return
  }

  const data = await runPipelineMulti(selectedFiles)

  if (data) {
    console.log("Backend Data:", data)
    setBackendData(data)
  }
}

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
        {/* 🔥 Upload Panel (ADD HERE) */}
  <div style={{
    position: 'absolute',
    top: 90,
    left: 20,
    zIndex: 1000,
    background: 'rgba(0,0,0,0.75)',
    padding: '10px',
    borderRadius: '10px',
    backdropFilter: 'blur(6px)',
    border: '1px solid var(--border-color)',
  }}>
    
    <input
      type="file"
      multiple
      onChange={handleFileChange}
      style={{ color: 'white', fontSize: '12px' }}
    />
    <button
      onClick={handleRun}
      style={{
        marginTop: '6px',
        width: '100%',
        padding: '6px',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold'
      }}
    >
      Run Intelligence
    </button>
  </div>
          <div 
            style={{ 
              position: 'absolute', inset: 0, 
              transition: 'opacity 1s ease-in-out', 
              opacity: viewMode === '2d' ? 1 : 0,
              zIndex: viewMode === '2d' ? 2 : 1,
              pointerEvents: viewMode === '2d' ? 'auto' : 'none'
            }}
          >
            {/* 🔥 SAR Viewer (SEPARATE) */}
            <SARViewer files={selectedFiles} backendData={backendData} />
            <Map2D 
              ships={processedShips} 
              alerts={liveAlerts}
              clusters={clusters}
              onSelectShip={handleSelectShip} 
              focusShip={focusShip} 
              environment={environment}
              theme={theme}
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
            {false && (
              <Globe3D 
              ships={processedShips} 
              alerts={mergedAlerts}
              clusters={clusters}
              onSelectShip={handleSelectShip} 
              environment={environment}
              viewState={viewState}
              onViewChange={(coords) => handleViewTransition('2d', coords)}
              visible={viewMode === '3d'}
              />
              )}
          </div>

          {/* ── Alerts Panel (overlay, slides in from right) ── */}
          <AlertsPanel
            alerts={mergedAlerts}
            onAlertClick={handleAlertClick}
            isOpen={isPanelOpen}
            onClose={() => setIsPanelOpen(false)}
          />

          {/* ── Panel Toggle Button (right edge) ── */}
          <button
            onClick={() => setIsPanelOpen(prev => !prev)}
            title={isPanelOpen ? 'Close Intelligence Panel' : 'Open Intelligence Panel'}
            style={{
              position: 'absolute',
              right: isPanelOpen ? 'var(--panel-width)' : '0',
              top: '50%',
              transform: 'translateY(-50%)',
              transition: 'right 0.4s ease-in-out',
              zIndex: 60,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRight: isPanelOpen ? '1px solid var(--border-color)' : 'none',
              borderRadius: '6px 0 0 6px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              width: '22px',
              padding: '18px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '-3px 0 12px rgba(0,0,0,0.25)',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
          >
            {/* Chevron arrow — rotates when open */}
            <span style={{
              fontSize: '14px', lineHeight: 1, fontFamily: 'var(--font-mono)',
              display: 'block',
              transform: isPanelOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.4s ease-in-out',
            }}>›</span>
            {/* Alert count badge */}
            {!isPanelOpen && mergedAlerts.length > 0 && (
              <span style={{
                fontSize: '9px', fontWeight: 700, color: 'var(--danger)',
                fontFamily: 'var(--font-mono)', lineHeight: 1,
                writingMode: 'vertical-rl',
                letterSpacing: '1px',
              }}>{mergedAlerts.length}</span>
            )}
          </button>
        </div>
      </div>

      <StatsBar 
      ships={processedShips} 
      loiteringCount={loiteringCount} 
      />

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
