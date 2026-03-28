import { useMemo } from 'react'
import { timeAgo, formatLocalTime } from '../utils/timeUtils'

const RISK_COLORS  = { HIGH: '#8B6C6C', MEDIUM: '#9E9689', LOW: 'rgba(226, 215, 195, 0.4)' }
const TYPE_ICONS   = { DARK_VESSEL: '🚫', AIS_SPOOF: '📡', ZONE_VIOLATION: '⚠️' }
const TYPE_LABELS  = { DARK_VESSEL: 'DARK VESSEL', AIS_SPOOF: 'AIS SPOOF', ZONE_VIOLATION: 'ZONE VIOLATION' }
const TYPE_COLORS  = { DARK_VESSEL: 'var(--accent)', AIS_SPOOF: 'var(--accent)', ZONE_VIOLATION: 'var(--accent)' }

export default function AlertsPanel({ alerts = [], onAlertClick, isOpen, onClose }) {

  const safeAlerts = alerts || []

  const sorted = useMemo(() => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return [...safeAlerts].sort((a, b) => (order[a?.severity] ?? 3) - (order[b?.severity] ?? 3))
  }, [safeAlerts])

  const critCount = sorted.filter(a => a?.severity === 'HIGH').length

  return (
    <div style={{
      position: 'absolute',
      top: 0, right: 0, bottom: 0,
      width: 'clamp(300px, var(--panel-width), 100vw)',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, zIndex: 50,
      fontFamily: 'var(--font-main)',
      boxShadow: '-6px 0 28px rgba(0,0,0,0.35)',
      backdropFilter: 'blur(4px)',
      transform: isOpen ? 'translateX(0%)' : 'translateX(100%)',
      transition: 'transform 0.4s ease-in-out',
      willChange: 'transform',
    }}>

      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px' }}>
            INTELLIGENCE ALERTS
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
            }}>
              {sorted.length} LIVE
            </div>

            <button onClick={onClose}>›</button>
          </div>
        </div>

        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
          {critCount} critical · {sorted.length} total
        </div>
      </div>

      {/* Type Summary */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
        {['DARK_VESSEL', 'AIS_SPOOF', 'ZONE_VIOLATION'].map((type) => (
          <div key={type} style={{ flex: 1, textAlign: 'center', padding: '10px' }}>
            <div>{TYPE_ICONS[type]}</div>
            <div>
              {sorted.filter(a => a?.type === type).length}
            </div>
            <div>{type}</div>
          </div>
        ))}
      </div>

      {/* Alerts List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.map((alert, idx) => {

          const severity = alert?.severity || 'LOW'
          const c = RISK_COLORS[severity] || '#888'

          const vesselName = alert?.vessel_name || 'Unknown Vessel'
          const vesselId = alert?.vessel_id || 'N/A'

          const lat = typeof alert?.lat === 'number' ? alert.lat.toFixed(4) : '--'
          const lng = typeof alert?.lng === 'number' ? alert.lng.toFixed(4) : '--'

          const message = alert?.message || 'No details available'

          return (
            <div
              key={alert?.alert_id || idx}
              onClick={() => onAlertClick?.(alert)}
              style={{
                padding: '12px',
                borderLeft: `3px solid ${c}`,
                borderBottom: '1px solid var(--border-color)',
                cursor: 'pointer',
              }}
            >

              {/* Header Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>{TYPE_LABELS[alert?.type] || 'UNKNOWN'}</div>
                <div>{timeAgo(alert?.timestamp)}</div>
              </div>

              {/* Vessel */}
              <div style={{ fontWeight: 'bold' }}>
                {vesselName}
              </div>

              <div style={{ fontSize: '10px' }}>
                {vesselId} · {lat}°N {lng}°E
              </div>

              {/* Message */}
              <div style={{ fontSize: '11px' }}>
                {(message || '').length > 90
                  ? message.slice(0, 90) + '…'
                  : message}
              </div>

              {/* Time */}
              <div style={{ fontSize: '9px' }}>
                LOCAL: {formatLocalTime(alert?.timestamp)}
              </div>

            </div>
          )
        })}
      </div>
    </div>
  )
}