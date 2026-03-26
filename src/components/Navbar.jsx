import { useState, useEffect } from 'react'

const styles = {
  nav: {
    height: 'var(--navbar-height)',
    background: 'rgba(6,11,24,0.97)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    zIndex: 1000,
    position: 'relative',
  },
  left: { display: 'flex', alignItems: 'center', gap: '16px' },
  logo: {
    display: 'flex', alignItems: 'center', gap: '10px',
    textDecoration: 'none',
  },
  logoIcon: {
    width: '32px', height: '32px',
    background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)',
    borderRadius: '6px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', fontWeight: 700,
    color: '#fff',
    boxShadow: '0 0 16px rgba(0,212,255,0.4)',
  },
  logoText: {
    fontFamily: 'var(--font-main)',
    fontSize: '20px', fontWeight: 700, letterSpacing: '4px',
    background: 'linear-gradient(90deg, #00d4ff, #4488ff)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  logoSub: {
    fontSize: '10px', fontWeight: 400, letterSpacing: '1px',
    color: 'var(--text-secondary)', display: 'block',
    fontFamily: 'var(--font-mono)',
    WebkitTextFillColor: 'var(--text-secondary)',
  },
  divider: { width: '1px', height: '30px', background: 'var(--border-color)' },
  statusGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  liveDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: '#00e676',
    animation: 'live-blink 1.2s ease-in-out infinite',
    boxShadow: '0 0 8px #00e676',
  },
  liveText: {
    color: '#00e676', fontSize: '11px', fontWeight: 600, letterSpacing: '2px',
    fontFamily: 'var(--font-mono)',
  },
  center: { display: 'flex', alignItems: 'center', gap: '24px' },
  stat: { textAlign: 'center' },
  statVal: { display: 'block', fontSize: '18px', fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono)' },
  statLabel: { display: 'block', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text-secondary)', marginTop: '3px' },
  right: { display: 'flex', alignItems: 'center', gap: '12px' },
  toggle: {
    display: 'flex', alignItems: 'center',
    background: 'rgba(0,20,50,0.8)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '3px',
    gap: '2px',
  },
  toggleBtn: (active) => ({
    padding: '5px 16px',
    borderRadius: '16px',
    fontSize: '12px', fontWeight: 600, letterSpacing: '1px',
    cursor: 'pointer', border: 'none',
    transition: 'all 0.25s ease',
    fontFamily: 'var(--font-main)',
    background: active ? 'linear-gradient(135deg, #00d4ff22, #0066ff44)' : 'transparent',
    color: active ? 'var(--cyan)' : 'var(--text-secondary)',
    boxShadow: active ? '0 0 12px rgba(0,212,255,0.3)' : 'none',
    borderColor: active ? 'var(--border-bright)' : 'transparent',
  }),
  timeStr: {
    color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)',
    background: 'rgba(0,212,255,0.05)', padding: '4px 10px', borderRadius: '4px',
    border: '1px solid var(--border-color)',
  },
}

export default function Navbar({ viewMode, onToggleView, totalShips, highCount, alertCount }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

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
      </div>

      {/* Center: Stats */}
      <div style={styles.center}>
        <div style={styles.stat}>
          <span style={{ ...styles.statVal, color: 'var(--cyan)' }}>{totalShips}</span>
          <span style={styles.statLabel}>VESSELS</span>
        </div>
        <div style={styles.divider} />
        <div style={styles.stat}>
          <span style={{ ...styles.statVal, color: 'var(--danger)' }}>{highCount}</span>
          <span style={styles.statLabel}>HIGH RISK</span>
        </div>
        <div style={styles.divider} />
        <div style={styles.stat}>
          <span style={{ ...styles.statVal, color: 'var(--warning)' }}>{alertCount}</span>
          <span style={styles.statLabel}>ALERTS</span>
        </div>
        <div style={styles.divider} />
        <div style={styles.stat}>
          <span style={{ ...styles.statVal, color: 'var(--success)' }}>SAR</span>
          <span style={styles.statLabel}>SENTINEL-1</span>
        </div>
      </div>

      {/* Right: View Toggle + Time */}
      <div style={styles.right}>
        <span style={styles.timeStr}>{fmt(time)}</span>
        <div style={styles.toggle}>
          <button style={styles.toggleBtn(viewMode === '2d')} onClick={() => onToggleView('2d')}>2D MAP</button>
          <button style={styles.toggleBtn(viewMode === '3d')} onClick={() => onToggleView('3d')}>3D GLOBE</button>
        </div>
      </div>
    </nav>
  )
}
