import { useMemo } from 'react'
import { timeAgo, formatLocalTime } from '../utils/timeUtils'

const RISK_COLORS  = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }
const RISK_BG      = { HIGH: 'rgba(255,45,85,0.10)', MEDIUM: 'rgba(255,184,48,0.08)', LOW: 'rgba(0,230,118,0.06)' }
const TYPE_ICONS   = { DARK_VESSEL: '🚫', AIS_SPOOF: '📡', ZONE_VIOLATION: '⚠️' }
const TYPE_LABELS  = { DARK_VESSEL: 'DARK VESSEL', AIS_SPOOF: 'AIS SPOOF', ZONE_VIOLATION: 'ZONE VIOLATION' }
const TYPE_COLORS  = { DARK_VESSEL: '#ff2d55', AIS_SPOOF: '#ffb830', ZONE_VIOLATION: '#ff6b3d' }

export default function AlertsPanel({ alerts, onAlertClick }) {
  const sorted = useMemo(() => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return [...alerts].sort((a, b) => order[a.severity] - order[b.severity])
  }, [alerts])

  const critCount = sorted.filter(a => a.severity === 'HIGH').length

  return (
    <div style={{
      width: 'var(--panel-width)', flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', overflow: 'hidden',
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
        flexShrink: 0, background: 'rgba(0,212,255,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', color: 'var(--text-primary)' }}>
            ⚡ INTELLIGENCE ALERTS
          </div>
          <div style={{
            background: 'var(--danger-dim)', color: 'var(--danger)',
            fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)',
            padding: '3px 9px', borderRadius: '4px', border: '1px solid rgba(255,45,85,0.3)',
            animation: critCount > 0 ? 'danger-pulse 2s ease infinite' : 'none',
          }}>
            {critCount}
          </div>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {critCount} critical · {sorted.length} total events
        </div>
      </div>

      {/* Type Summary Row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        {[
          { key: 'DARK_VESSEL', label: 'DARK', icon: '🚫', color: '#ff2d55' },
          { key: 'AIS_SPOOF', label: 'SPOOF', icon: '📡', color: '#ffb830' },
          { key: 'ZONE_VIOLATION', label: 'ZONE', icon: '⚠️', color: '#ff6b3d' },
        ].map((t, i) => (
          <div key={t.key} style={{
            flex: 1, textAlign: 'center', padding: '8px 4px',
            borderRight: i < 2 ? '1px solid var(--border-color)' : 'none',
            background: 'rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontSize: '12px', marginBottom: '2px' }}>{t.icon}</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: t.color, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
              {sorted.filter(a => a.type === t.key).length}
            </div>
            <div style={{ fontSize: '8px', color: 'var(--text-secondary)', letterSpacing: '1px', marginTop: '1px' }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.map((alert, idx) => {
          const c  = RISK_COLORS[alert.severity]
          const tc = TYPE_COLORS[alert.type]
          const isHighest = idx === 0
          return (
            <div
              key={alert.alert_id}
              onClick={() => onAlertClick(alert)}
              style={{
                padding: '11px 14px',
                borderBottom: '1px solid var(--border-color)',
                borderLeft: `3px solid ${c}`,
                cursor: 'pointer',
                background: isHighest ? RISK_BG[alert.severity] : 'transparent',
                transition: 'background 0.18s, transform 0.15s',
                animation: `fadeIn 0.3s ease forwards`,
                animationDelay: `${idx * 35}ms`,
                opacity: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = RISK_BG[alert.severity]
                e.currentTarget.style.transform = 'translateX(2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isHighest ? RISK_BG[alert.severity] : 'transparent'
                e.currentTarget.style.transform = 'translateX(0)'
              }}
            >
              {/* Row 1: Badges + Time */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px' }}>{TYPE_ICONS[alert.type]}</span>
                  <span style={{
                    fontSize: '8px', fontWeight: 700, letterSpacing: '1.2px', color: tc,
                    background: `${tc}18`, padding: '2px 5px', borderRadius: '3px', border: `1px solid ${tc}33`,
                  }}>
                    {TYPE_LABELS[alert.type]}
                  </span>
                  <span style={{
                    fontSize: '8px', fontWeight: 700, color: c, background: `${c}18`,
                    padding: '2px 5px', borderRadius: '3px', border: `1px solid ${c}33`,
                  }}>
                    {alert.severity}
                  </span>
                </div>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '4px' }}>
                  {timeAgo(alert.timestamp)}
                </span>
              </div>

              {/* Row 2: Vessel */}
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1px' }}>
                {alert.vessel_name}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                {alert.vessel_id} · {alert.lat?.toFixed(4)}°N {alert.lng?.toFixed(4)}°E
              </div>
              {/* Local timestamp */}
              <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                🕐 {formatLocalTime(alert.timestamp)}
              </div>

              {/* Row 3: Message */}
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {alert.message.length > 90 ? alert.message.slice(0, 90) + '…' : alert.message}
              </div>

              {/* CTA */}
              <div style={{ marginTop: '6px', fontSize: '9px', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', letterSpacing: '0.8px' }}>
                CLICK TO INVESTIGATE →
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
