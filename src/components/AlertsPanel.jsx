import { useMemo } from 'react'

const RISK_COLORS  = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }
const RISK_BG      = { HIGH: 'rgba(255,45,85,0.12)', MEDIUM: 'rgba(255,184,48,0.10)', LOW: 'rgba(0,230,118,0.08)' }
const TYPE_ICONS   = { DARK_VESSEL: '🚫', AIS_SPOOF: '📡', ZONE_VIOLATION: '⚠️' }
const TYPE_LABELS  = { DARK_VESSEL: 'DARK VESSEL', AIS_SPOOF: 'AIS SPOOF', ZONE_VIOLATION: 'ZONE VIOLATION' }
const TYPE_COLORS  = { DARK_VESSEL: '#ff2d55', AIS_SPOOF: '#ffb830', ZONE_VIOLATION: '#ff6b3d' }

function timeAgo(ts) {
  const diff = Math.round((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  return `${Math.floor(diff/3600)}h ago`
}

export default function AlertsPanel({ alerts, onAlertClick }) {
  const sorted = useMemo(() => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return [...alerts].sort((a, b) => order[a.severity] - order[b.severity])
  }, [alerts])

  return (
    <div style={{
      width: 'var(--panel-width)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
      overflow: 'hidden',
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--text-primary)' }}>
            INTELLIGENCE ALERTS
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            {sorted.filter(a => a.severity === 'HIGH').length} critical · {sorted.length} total
          </div>
        </div>
        <div style={{
          background: 'var(--danger-dim)', color: 'var(--danger)',
          fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)',
          padding: '4px 10px', borderRadius: '4px',
          border: '1px solid rgba(255,45,85,0.25)',
        }}>
          {sorted.filter(a => a.severity === 'HIGH').length}
        </div>
      </div>

      {/* Alert Type Summary */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', flexShrink: 0,
      }}>
        {[
          { key: 'DARK_VESSEL', label: 'DARK', icon: '🚫', color: '#ff2d55' },
          { key: 'AIS_SPOOF',   label: 'SPOOF', icon: '📡', color: '#ffb830' },
          { key: 'ZONE_VIOLATION', label: 'ZONE', icon: '⚠️', color: '#ff6b3d' },
        ].map((t, i) => (
          <div key={t.key} style={{
            flex: 1, textAlign: 'center', padding: '8px 4px',
            borderRight: i < 2 ? '1px solid var(--border-color)' : 'none',
          }}>
            <div style={{ fontSize: '12px' }}>{t.icon}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: t.color, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
              {sorted.filter(a => a.type === t.key).length}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '1px' }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.map((alert, idx) => {
          const c = RISK_COLORS[alert.severity]
          const tc = TYPE_COLORS[alert.type]
          return (
            <div
              key={alert.alert_id}
              onClick={() => onAlertClick(alert)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-color)',
                borderLeft: `3px solid ${c}`,
                cursor: 'pointer',
                background: idx === 0 ? RISK_BG[alert.severity] : 'transparent',
                transition: 'background 0.2s',
                animation: 'fadeIn 0.3s ease forwards',
                animationDelay: `${idx * 40}ms`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = RISK_BG[alert.severity]}
              onMouseLeave={e => e.currentTarget.style.background = idx === 0 ? RISK_BG[alert.severity] : 'transparent'}
            >
              {/* Row 1: Badge + ID + Time */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px' }}>{TYPE_ICONS[alert.type]}</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px',
                    color: tc, background: `${tc}18`, padding: '2px 6px', borderRadius: '3px',
                    border: `1px solid ${tc}33`,
                  }}>
                    {TYPE_LABELS[alert.type]}
                  </span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '1px',
                    color: c, background: `${c}18`, padding: '2px 6px', borderRadius: '3px',
                  }}>
                    {alert.severity}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {timeAgo(alert.timestamp)}
                </span>
              </div>

              {/* Row 2: Vessel Name */}
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                {alert.vessel_name}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '5px' }}>
                {alert.vessel_id} · {alert.lat.toFixed(4)}°N {alert.lng.toFixed(4)}°E
              </div>

              {/* Row 3: Message (truncated) */}
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {alert.message.length > 80 ? alert.message.slice(0, 80) + '…' : alert.message}
              </div>

              {/* CTA */}
              <div style={{
                marginTop: '7px', fontSize: '10px', color: 'var(--cyan)',
                fontFamily: 'var(--font-mono)', letterSpacing: '1px',
              }}>
                CLICK TO INVESTIGATE →
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
