import { useState, useCallback, useEffect } from 'react'
import Navbar           from './components/Navbar.jsx'
import Map2D            from './components/Map2D.jsx'
import Globe3D          from './components/Globe3D.jsx'
import AlertsPanel      from './components/AlertsPanel.jsx'
import ShipModal        from './components/ShipModal.jsx'
import StatsBar         from './components/StatsBar.jsx'
import OnboardingOverlay from './components/OnboardingOverlay.jsx'
import LearnSection     from './components/LearnSection.jsx'

import shipsData  from './data/ships.json'
import alertsData from './data/alerts.json'

const ONBOARDING_KEY = 'zenith_onboarding_done'
const THEME_KEY      = 'zenith_theme'

export default function App() {
  const [viewMode,      setViewMode]      = useState('2d')
  const [selectedShip,  setSelectedShip]  = useState(null)
  const [focusShip,     setFocusShip]     = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showLearn,     setShowLearn]     = useState(false)
  const [theme,         setTheme]         = useState(
    () => localStorage.getItem(THEME_KEY) || 'dark'
  )

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
    const ship = shipsData.find(s => s.id === alert.vessel_id)
    if (ship) {
      setFocusShip(ship)
      setSelectedShip(ship)
      setTimeout(() => setFocusShip(null), 300)
    }
  }, [])

  const highCount  = shipsData.filter(s => s.risk === 'HIGH').length
  const alertCount = alertsData.length

  return (
    <div
      data-theme={theme}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)', color: 'var(--text-primary)', transition: 'background 0.35s ease, color 0.35s ease' }}
    >
      {/* Navbar */}
      <Navbar
        viewMode={viewMode}
        onToggleView={setViewMode}
        totalShips={shipsData.length}
        highCount={highCount}
        alertCount={alertCount}
        onLearnClick={() => setShowLearn(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Content Row */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map / Globe Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === '2d' ? (
            <Map2D ships={shipsData} onSelectShip={handleSelectShip} focusShip={focusShip} />
          ) : (
            <Globe3D ships={shipsData} onSelectShip={handleSelectShip} />
          )}

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
        <AlertsPanel alerts={alertsData} onAlertClick={handleAlertClick} />
      </div>

      {/* Stats Bar */}
      <StatsBar ships={shipsData} />

      {/* Ship Modal */}
      {selectedShip && <ShipModal ship={selectedShip} onClose={handleCloseModal} />}

      {/* Onboarding Overlay */}
      {showOnboarding && <OnboardingOverlay onDismiss={handleDismissOnboarding} />}

      {/* Learn Section */}
      {showLearn && <LearnSection onClose={() => setShowLearn(false)} />}
    </div>
  )
}
