import { useEffect, Component } from 'react'
import { formatLocalTime } from '../utils/timeUtils'
import ShipViewer from './ShipModel.jsx'

const RISK_COLORS = { HIGH: 'var(--surface-light)', MEDIUM: 'var(--text-secondary)', LOW: 'var(--text-dim)' }
const AIS_COLORS = { ABSENT: 'var(--text-secondary)', SPOOFED: 'var(--accent)', PRESENT: 'var(--accent)' }

/**
 * Determine which GLB model to load for a given ship.
 */
function getModelType(ship) {
  if (ship.ais_status === 'ABSENT') return 'dark'
  const vt = (ship.vessel_type || '').toLowerCase()
  if (vt.includes('naval') || vt.includes('warship') || vt.includes('patrol')) return 'naval'
  return 'cargo'
}

/* ── Intelligence Profile Field ── */
function Field({ label, value, color, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, letterSpacing: '1px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{
        fontSize: mono ? 12 : 13,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-main)',
        fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1.3,
      }}>{value}</span>
    </div>
  )
}

/* ── Detection confidence bar ── */
function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 85 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, letterSpacing: '1.5px', color: 'var(--text-dim)', fontWeight: 600 }}>
          DETECTION CONFIDENCE
        </span>
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(127,127,127,0.12)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: color,
          transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  )
}

export default function ShipModal({ ship, environment, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!ship) return null

  const color = RISK_COLORS[ship.risk]
  const aisColor = AIS_COLORS[ship.ais_status]
  const modelType = getModelType(ship)

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(2,5,12,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(14px)',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{
        width: 'min(980px, 96vw)',
        height: 'min(610px, 92vh)',
        background: 'var(--bg-card)',
        border: `1px solid ${color}55`,
        borderRadius: 14,
        display: 'flex',
        overflow: 'hidden',
        boxShadow: `0 0 1px ${color}18, 0 28px 100px ${color}18, 0 0 80px rgba(0,0,0,0.7)`,
        animation: 'modalOpen 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>

        {/* ── Left: 3D Canvas (60%) ── */}
        <div style={{
          flex: '0 0 60%',
          background: `var(--bg-primary)`,
          borderRight: `1px solid var(--border-color)`,
          display: 'flex', flexDirection: 'column',
          position: 'relative'
        }}>
          {/* Panel header */}
            <div style={{
            padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid var(--border-color)`, flexShrink: 0,
            background: `rgba(0,0,0,0.15)`,
            zIndex: 10
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: 'var(--text-primary)' }}>VESSEL PROFILE</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2, opacity: 0.8 }}>
                {ship.vessel_type.toUpperCase()} · {ship.length_m}M
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,45,85,0.1)', color: '#ff2d55',
                border: '1px solid rgba(255,45,85,0.3)', borderRadius: 6,
                width: 30, height: 30, fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,45,85,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,45,85,0.1)'}
            >✕</button>
          </div>

          {/* New Dynamic GLB Ship Viewer (Includes its own Canvas) */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <ShipViewer type={modelType} ship={ship} />

          </div>
        </div>

        {/* ── Right: Intelligence Profile (40%) ── */}
        <div style={{ flex: '0 0 40%', overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: `1px solid var(--border-color)`, background: `rgba(0,0,0,0.15)`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: 0.5, lineHeight: 1.1 }}>
                  {ship.vessel_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>
                  {ship.id} · MMSI {ship.mmsi}
                </div>
              </div>
              <div style={{
                background: `rgba(201, 214, 207, 0.05)`, color: 'var(--text-primary)', padding: '6px 14px',
                borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600, letterSpacing: '1px',
                border: `1px solid var(--border-color)`, flexShrink: 0,
              }}>
                {ship.risk} RISK
              </div>
            </div>
          </div>

          {/* Fields grid */}
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, background: 'var(--bg-card)' }}>
            <Field label="VESSEL TYPE" value={ship.vessel_type} />
            <Field label="FLAG STATE" value={ship.flag} />
            <Field label="LENGTH" value={`${ship.length_m} m`} mono />
            <Field label="SPEED" value={`${ship.speed_knots} kts`} mono />
            <Field label="HEADING" value={`${ship.heading}°`} mono />
            <Field label="AIS STATUS" value={ship.ais_status} color={aisColor} mono />
            <Field label="ENVIRONMENT" value={`${ship.env?.icon} ${ship.env?.condition}`} />
            <Field label="SEA STATE" value={ship.env?.seaState} color={ship.env?.seaState === 'Rough' ? '#F59E0B' : 'var(--text-primary)'} />
            <Field label="COORDINATES" value={`${ship.lat.toFixed(4)}°N  ${ship.lng.toFixed(4)}°E`} mono />
            <Field label="LAST SEEN" value={formatLocalTime(ship.last_seen)} mono />
          </div>

          {/* Intel assessment */}
          <div style={{ margin: '0 22px 16px', background: `${color}08`, border: `1px solid ${color}30`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '1.5px', color, fontWeight: 700, marginBottom: 8 }}>⚠ INTELLIGENCE ASSESSMENT</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {ship.ais_status === 'ABSENT' ? (
                ship.env?.condition === 'Stormy' || ship.env?.seaState === 'Rough' 
                  ? 'CRITICAL: No AIS detected in heavy weather. High probability of clandestine operations or emergency distress.'
                  : 'No AIS detected — potential dark vessel. Evasive maneuvers probable.'
              ) :
                ship.ais_status === 'SPOOFED' ? 'AIS transmission mismatch — significant spoofing probability detected. Proceed with caution.' :
                  ship.risk === 'HIGH' ? (
                    ship.env?.seaState === 'Rough'
                      ? 'HIGH RISK: Anomalous patterns detected in rough seas. Vessel stability and intent flagged for monitoring.'
                      : 'AIS verified — anomalous route patterns flagged. Intercept highly recommended.'
                  ) :
                    'AIS verified — normal route and predictable navigation patterns recognized.'}
            </div>
          </div>

          {/* Confidence bar */}
          <div style={{ margin: '0 22px 18px' }}>
            <ConfidenceBar value={ship.confidence} />
          </div>
        </div>
      </div>
    </div>
  )
}
