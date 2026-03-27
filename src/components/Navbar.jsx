import { useState, useEffect } from 'react'
import { formatNavbarTime } from '../utils/timeUtils'

const styles = {
  nav: {
    height: 'var(--navbar-height)',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    zIndex: 1000,
    position: 'relative',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 1px 0 rgba(0,212,255,0.08), 0 4px 24px rgba(0,0,0,0.5)',
  },
  left: { display: 'flex', alignItems: 'center', gap: '16px' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
  logoIcon: {
    width: '34px', height: '34px',
    background: 'linear-gradient(135deg, #00d4ff 0%, #0044cc 100%)',
    borderRadius: '7px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '17px', fontWeight: 800, color: '#fff',
    boxShadow: '0 0 18px rgba(0,212,255,0.45)',
    letterSpacing: '-1px',
  },
  logoText: {
    fontFamily: 'var(--font-main)',
    fontSize: '21px', fontWeight: 800, letterSpacing: '5px',
    background: 'linear-gradient(90deg, #00d4ff 0%, #4488ff 60%, #00d4ff 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    backgroundSize: '200% auto',
    animation: 'shimmer 4s linear infinite',
  },
  logoSub: {
    fontSize: '9px', fontWeight: 500, letterSpacing: '1.5px',
    color: 'var(--text-secondary)', display: 'block',
    fontFamily: 'var(--font-mono)', WebkitTextFillColor: 'var(--text-secondary)',
    marginTop: '-2px',
  },
  divider: { width: '1px', height: '28px', background: 'var(--border-color)', flexShrink: 0 },
  statusGroup: { display: 'flex', alignItems: 'center', gap: '6px' },
  liveDot: {
    width: '8px', height: '8px', borderRadius: '50%', background: '#00e676',
    animation: 'live-blink 1.2s ease-in-out infinite', boxShadow: '0 0 10px #00e676',
  },
  liveText: { color: '#00e676', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', fontFamily: 'var(--font-mono)' },
  center: { display: 'flex', alignItems: 'center', gap: '20px' },
  stat: { textAlign: 'center' },
  statVal: { display: 'block', fontSize: '18px', fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono)' },
  statLabel: { display: 'block', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text-secondary)', marginTop: '3px' },
  right: { display: 'flex', alignItems: 'center', gap: '10px' },
  toggle: {
    display: 'flex', alignItems: 'center',
    background: 'rgba(0,20,50,0.85)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px', padding: '3px', gap: '2px',
  },
  toggleBtn: (active) => ({
    padding: '5px 14px', borderRadius: '16px',
    fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
    cursor: 'pointer', border: 'none', transition: 'all 0.25s ease',
    fontFamily: 'var(--font-main)',
    background: active ? 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,102,255,0.3))' : 'transparent',
    color: active ? 'var(--cyan)' : 'var(--text-secondary)',
    boxShadow: active ? '0 0 14px rgba(0,212,255,0.3)' : 'none',
  }),
  timeStr: {
    color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'var(--font-mono)',
    background: 'rgba(0,212,255,0.05)', padding: '4px 10px', borderRadius: '4px',
    border: '1px solid var(--border-color)', letterSpacing: '0.3px',
  },
  envToggle: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'rgba(0,10,30,0.4)', padding: '4px 10px',
    borderRadius: '10px', border: '1px solid var(--border-color)',
  },
  envBtn: (active, color) => ({
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: '14px', padding: '4px', borderRadius: '4px',
    transition: 'all 0.2s',
    opacity: active ? 1 : 0.3,
    filter: active ? `drop-shadow(0 0 4px ${color})` : 'grayscale(1)',
  }),
}

export default function Navbar({ 
  viewMode, onToggleView, totalShips, highCount, alertCount, theme, onToggleTheme,
  environment, setEnvironment
}) {
  const [time, setTime] = useState(new Date())
  const [spinning, setSpinning] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleThemeToggle = () => {
    setSpinning(true)
    onToggleTheme()
    setTimeout(() => setSpinning(false), 450)
  }

  return (
    <nav style={styles.nav}>
      {/* Left: Logo + Status */}
      <div style={styles.left}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>Z</div>
          <div>
            <span style={styles.logoText}>ZENITH</span>
            <span style={styles.logoSub}>MARITIME INTELLIGENCE PLATFORM</span>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.statusGroup}>
          <div style={styles.liveDot} />
          <span style={styles.liveText}>LIVE</span>
        </div>
        <div style={styles.divider} />
        {/* Radar sweep indicator */}
        <div style={{ position: 'relative', width: '28px', height: '28px' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.25)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 70%, rgba(0,212,255,0.6) 100%)',
            animation: 'radarSpin 2.4s linear infinite',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: '4px', height: '4px', borderRadius: '50%',
            background: '#00d4ff', transform: 'translate(-50%,-50%)',
            boxShadow: '0 0 6px #00d4ff',
          }} />
        </div>
      </div>

      {/* Center: Stats */}
      <div style={styles.center}>
        {[
          { label: 'VESSELS', val: totalShips, color: 'var(--cyan)' },
          null,
          { label: 'HIGH RISK', val: highCount, color: 'var(--danger)' },
          null,
          { label: 'ALERTS', val: alertCount, color: 'var(--warning)' },
          null,
          { label: 'SENTINEL-1', val: 'SAR', color: 'var(--success)' },
        ].map((item, i) =>
          item === null ? (
            <div key={i} style={styles.divider} />
          ) : (
            <div key={item.label} style={styles.stat}>
              <span style={{ ...styles.statVal, color: item.color }}>{item.val}</span>
              <span style={styles.statLabel}>{item.label}</span>
            </div>
          )
        )}
      </div>

      {/* Right: Environment + Theme Toggle + View Toggle + Time */}
      <div style={styles.right}>
        {/* Environment Toggles */}
        <div style={styles.envToggle}>
          <button 
            style={styles.envBtn(environment.time === 'day', '#ffc832')}
            onClick={() => setEnvironment(prev => ({ ...prev, time: prev.time === 'day' ? 'night' : 'day' }))}
            title={`Switch to ${environment.time === 'day' ? 'Night' : 'Day'}`}
          >
            {environment.time === 'day' ? '☀️' : '🌙'}
          </button>
          <button 
            style={styles.envBtn(environment.weatherEnabled, '#00d4ff')}
            onClick={() => setEnvironment(prev => ({ ...prev, weatherEnabled: !prev.weatherEnabled }))}
            title={`${environment.weatherEnabled ? 'Disable' : 'Enable'} Weather Layer`}
          >
            ☁️
          </button>
          <button 
            style={styles.envBtn(environment.seaEnabled, '#4488ff')}
            onClick={() => setEnvironment(prev => ({ ...prev, seaEnabled: !prev.seaEnabled }))}
            title={`${environment.seaEnabled ? 'Disable' : 'Enable'} Sea Simulation`}
          >
            🌊
          </button>
        </div>

        <div style={styles.divider} />
        
        <span style={styles.timeStr}>{formatNavbarTime(time)}</span>
        {/* Theme toggle */}
        <button
          onClick={handleThemeToggle}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: theme === 'dark' ? 'rgba(255,200,50,0.1)' : 'rgba(0,80,180,0.1)',
            border: theme === 'dark' ? '1px solid rgba(255,200,50,0.3)' : '1px solid rgba(0,80,180,0.3)',
            color: theme === 'dark' ? '#ffc832' : '#0055cc',
            cursor: 'pointer', fontSize: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <span style={{ display: 'inline-block', animation: spinning ? 'iconSpin 0.4s ease' : 'none' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
        </button>
        {/* 2D / 3D toggle */}
        <div style={styles.toggle}>
          <button style={styles.toggleBtn(viewMode === '2d')} onClick={() => onToggleView('2d')}>2D MAP</button>
          <button style={styles.toggleBtn(viewMode === '3d')} onClick={() => onToggleView('3d')}>3D GLOBE</button>
        </div>
      </div>
    </nav>
  )
}
