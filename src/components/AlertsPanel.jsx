import { useMemo } from 'react'
import { timeAgo, formatLocalTime } from '../utils/timeUtils'

const RISK_COLORS  = { HIGH: '#8B6C6C', MEDIUM: '#9E9689', LOW: 'rgba(226, 215, 195, 0.4)' }
const TYPE_ICONS   = { DARK_VESSEL: '🚫', AIS_SPOOF: '📡', ZONE_VIOLATION: '⚠️' }
const TYPE_LABELS  = { DARK_VESSEL: 'DARK VESSEL', AIS_SPOOF: 'AIS SPOOF', ZONE_VIOLATION: 'ZONE VIOLATION' }
const TYPE_COLORS  = { DARK_VESSEL: 'var(--accent)', AIS_SPOOF: 'var(--accent)', ZONE_VIOLATION: 'var(--accent)' }

export default function AlertsPanel({ alerts, onAlertClick }) {
  const sorted = useMemo(() => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return [...alerts].sort((a, b) => order[a.severity] - order[b.severity])
  }, [alerts])

  const critCount = sorted.filter(a => a.severity === 'HIGH').length

  return (
    <div style={{
      width: 'var(--panel-width)', height: '100%',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, zIndex: 10,
      fontFamily: 'var(--font-main)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '16px', borderBottom: '1px solid var(--border-color)',
        flexShrink: 0, background: 'rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ 
            fontSize: '11px', fontWeight: 600, letterSpacing: '2px', 
            color: 'var(--text-primary)', fontFamily: 'var(--font-main)' 
          }}>
            INTELLIGENCE ALERTS
          </div>
          <div style={{
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontSize: '11px', fontWeight: 600, padding: '3px 8px',
            borderRadius: '4px', fontFamily: 'var(--font-mono)',
            border: '1px solid var(--border-color)',
          }}>
            {sorted.length} LIVE
          </div>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {critCount} critical · {sorted.length} total events
        </div>
      </div>

      {/* Type Summary Row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        {[
          { key: 'DARK_VESSEL', label: 'DARK', icon: '🚫', color: 'var(--danger)' },
          { key: 'AIS_SPOOF', label: 'SPOOF', icon: '📡', color: 'var(--warning)' },
          { key: 'ZONE_VIOLATION', label: 'ZONE', icon: '⚠️', color: 'var(--warning)' },
        ].map((t, i) => (
          <div key={t.key} style={{
            flex: 1, textAlign: 'center', padding: '10px 4px',
            borderRight: i < 2 ? '1px solid var(--border-color)' : 'none',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ fontSize: '12px', marginBottom: '2px' }}>{t.icon}</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: t.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {sorted.filter(a => a.type === t.key).length}
            </div>
            <div style={{ fontSize: '8px', color: 'var(--text-secondary)', letterSpacing: '1px', marginTop: '2px', fontWeight: 500 }}>{t.label}</div>
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
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-color)',
                borderLeft: `3px solid ${c}`,
                cursor: 'pointer',
                background: 'var(--bg-card)',
                transition: 'background 0.2s',
                animation: `fadeIn 0.3s ease forwards`,
                animationDelay: `${idx * 35}ms`,
                opacity: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-card-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-card)'
              }}
            >
              {/* Row 1: Badges + Time */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '8px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--text-secondary)',
                    padding: '2px 6px', borderRadius: '3px', border: `1px solid var(--border-color)`,
                  }}>
                    {TYPE_LABELS[alert.type]}
                  </span>
                  <span style={{
                    fontSize: '8px', fontWeight: 600, color: c,
                    padding: '2px 6px', borderRadius: '3px', border: `1px solid ${c}44`,
                  }}>
                    {alert.severity}
                  </span>
                </div>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {timeAgo(alert.timestamp)}
                </span>
              </div>

              {/* Row 2: Vessel */}
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--surface-light)', marginBottom: '2px', fontFamily: 'var(--font-main)' }}>
                {alert.vessel_name}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                {alert.vessel_id} · {alert.lat?.toFixed(4)}°N {alert.lng?.toFixed(4)}°E
              </div>

              {/* Row 3: Message */}
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5', opacity: 0.9 }}>
                {alert.message.length > 90 ? alert.message.slice(0, 90) + '…' : alert.message}
              </div>

              {/* Local timestamp */}
              <div style={{ marginTop: '8px', fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>
                LOCAL: {formatLocalTime(alert.timestamp)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
