import { useState, useEffect } from 'react'
import { formatNavbarTime } from '../utils/timeUtils'

const styles = {
  nav: {
    height: 'var(--navbar-height)',
    background: 'var(--bg-primary)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    zIndex: 1000,
    position: 'relative',
    boxShadow: 'var(--shadow)',
  },
  left: { display: 'flex', alignItems: 'center', gap: '16px' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
  logoIcon: {
    width: '32px', height: '32px',
    background: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)',
    letterSpacing: '-1px',
    fontFamily: 'var(--font-main)',
    border: '1px solid var(--border-color)',
  },
  logoText: {
    fontFamily: 'var(--font-main)',
    fontSize: '20px', fontWeight: 600, letterSpacing: '0.5px',
    color: 'var(--text-primary)'
  },
  logoSub: {
    fontSize: '8px', fontWeight: 500, letterSpacing: '1.2px',
    color: 'var(--text-secondary)', display: 'block',
    fontFamily: 'var(--font-mono)', opacity: 0.8,
    marginTop: '-1px',
  },
  divider: { width: '1px', height: '28px', background: 'var(--border-color)', flexShrink: 0 },
  statusGroup: { display: 'flex', alignItems: 'center', gap: '6px' },
  center: { display: 'flex', alignItems: 'center', gap: '20px' },
  stat: { textAlign: 'center' },
  statVal: { display: 'block', fontSize: '18px', fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono)' },
  statLabel: { display: 'block', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text-secondary)', marginTop: '3px' },
  right: { display: 'flex', alignItems: 'center', gap: '10px' },
  toggle: {
    display: 'flex', alignItems: 'center',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius)', padding: '2px', gap: '2px',
  },
  toggleBtn: (active) => ({
    padding: '4px 12px', borderRadius: '4px',
    fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px',
    cursor: 'pointer', border: 'none', transition: 'all 0.2s ease',
    fontFamily: 'var(--font-main)',
    background: active ? 'var(--bg-secondary)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    boxShadow: active ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
  }),
  timeStr: {
    color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'var(--font-mono)',
    background: 'rgba(0,0,0,0.15)', padding: '4px 10px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color)', letterSpacing: '0.3px',
  },
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

        <span style={styles.timeStr}>{formatNavbarTime(time)}</span>
        {/* Theme toggle */}
        <button
          onClick={handleThemeToggle}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            height: '32px', padding: '0 12px', borderRadius: '8px',
            background: theme === 'dark' ? 'rgba(255,200,50,0.1)' : 'rgba(0,80,180,0.1)',
            border: theme === 'dark' ? '1px solid rgba(255,200,50,0.3)' : '1px solid rgba(0,80,180,0.3)',
            color: theme === 'dark' ? '#ffc832' : '#0055cc',
            cursor: 'pointer', fontSize: '11px', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            flexShrink: 0,
            fontFamily: 'var(--font-main)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <span style={{ display: 'inline-block', animation: spinning ? 'iconSpin 0.4s ease' : 'none' }}>
            {theme === 'dark' ? 'DARK' : 'LIGHT'}
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
