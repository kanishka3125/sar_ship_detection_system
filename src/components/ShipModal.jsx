import { useEffect, useRef, Suspense, Component } from 'react'
import { formatLocalTime } from '../utils/timeUtils'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import ShipModel from './ShipModel.jsx'

const RISK_COLORS = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }
const AIS_COLORS  = { ABSENT: '#ff2d55', SPOOFED: '#ffb830', PRESENT: '#00e676' }

/* ── Error boundary: bad GLB load never crashes the whole modal ── */
class CanvasErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
          fontSize: 11, gap: 8, padding: 24, textAlign: 'center',
        }}>
          <span style={{ fontSize: 32 }}>🚢</span>
          <span>3D MODEL UNAVAILABLE</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
            Add GLB files to /public/models/ to enable 3D view
          </span>
        </div>
      )
    }
    return this.props.children
  }
}


/**
 * Determine which GLB model to load for a given ship.
 *  - ABSENT AIS  → 'dark'   (dark vessel model)
 *  - Naval / patrol keyword → 'naval'
 *  - Everything else → 'cargo'
 */
function getModelType(ship) {
  if (ship.ais_status === 'ABSENT') return 'dark'
  const vt = (ship.vessel_type || '').toLowerCase()
  if (vt.includes('naval') || vt.includes('warship') || vt.includes('patrol')) return 'naval'
  return 'cargo'
}

/* ── Spinning ring shown while GLB loads ── */
function LoadingSpinner() {
  const r = useRef()
  useFrame((_, d) => { if (r.current) r.current.rotation.y += d * 2 })
  return (
    <mesh ref={r}>
      <torusGeometry args={[0.9, 0.05, 8, 36]} />
      <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={2} toneMapped={false} />
    </mesh>
  )
}

/* ── Intelligence Profile Field ── */
function Field({ label, value, color, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: '1.5px', color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
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
  const pct   = Math.round(value * 100)
  const color = pct >= 85 ? '#ff2d55' : pct >= 70 ? '#ffb830' : '#00e676'
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
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 12px ${color}`,
          transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Main ShipModal — 3D GLB model + intel profile
   ═══════════════════════════════════════════════ */
export default function ShipModal({ ship, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!ship) return null

  const color     = RISK_COLORS[ship.risk]
  const aisColor  = AIS_COLORS[ship.ais_status]
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
        boxShadow: `0 0 0 1px ${color}18, 0 28px 100px ${color}18, 0 0 80px rgba(0,0,0,0.7)`,
        animation: 'modalOpen 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>

        {/* ── Left: 3D Canvas ── */}
        <div style={{
          flex: '0 0 50%',
          background: `radial-gradient(ellipse at 50% 30%, ${color}12 0%, var(--bg-primary) 65%)`,
          borderRight: `1px solid ${color}22`,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${color}22`, flexShrink: 0,
            background: `${color}07`,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color }}>◈ 3D VESSEL PROFILE</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {ship.vessel_type.toUpperCase()} · {ship.length_m}M · IMO REGISTERED
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

          {/* Three.js Canvas — GLB model */}
          <div style={{ flex: 1, position: 'relative' }}>
            <Canvas
              camera={{ position: [0, 2, 6], fov: 45 }}
              gl={{ antialias: true }}
            >
              <color attach="background" args={['#04080f']} />
              {/* Lighting */}
              <ambientLight intensity={0.6} />
              <directionalLight position={[8, 10, 6]}   intensity={2.0} color="#fff8f0" castShadow />
              <directionalLight position={[-6, 4, -4]}  intensity={0.6} color="#aabbcc" />
              <directionalLight position={[0, -4, -8]}  intensity={0.3} color="#334466" />
              <pointLight       position={[0, -3, 0]}   intensity={0.4} color="#1144aa" />

              {/* GLB ship model — stable via Suspense + ShipModel's internal useMemo */}
              <Suspense fallback={<LoadingSpinner />}>
                <ShipModel type={modelType} />
              </Suspense>

              <OrbitControls
                enablePan={false}
                minDistance={3}
                maxDistance={18}
                enableDamping
                dampingFactor={0.05}
                autoRotate
                autoRotateSpeed={1.5}
              />
            </Canvas>
            <div style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
              background: 'rgba(4,8,15,0.75)', padding: '3px 14px', borderRadius: 12,
              backdropFilter: 'blur(6px)', border: '1px solid rgba(0,212,255,0.07)',
              whiteSpace: 'nowrap',
            }}>
              DRAG TO ROTATE · SCROLL TO ZOOM
            </div>
          </div>
        </div>

        {/* ── Right: Intelligence Profile ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${color}22`, background: `${color}08`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 1, lineHeight: 1.1 }}>
                  {ship.vessel_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {ship.id} · MMSI {ship.mmsi} · FLAG: {ship.flag}
                </div>
              </div>
              <div style={{
                background: `${color}1e`, color, padding: '7px 16px',
                borderRadius: 6, fontSize: 12, fontWeight: 700, letterSpacing: '2px',
                border: `1px solid ${color}55`, flexShrink: 0,
                boxShadow: `0 0 18px ${color}1a`,
              }}>
                {ship.risk} RISK
              </div>
            </div>
          </div>

          {/* Fields grid */}
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, background: 'var(--bg-card)' }}>
            <Field label="VESSEL TYPE"  value={ship.vessel_type} />
            <Field label="FLAG STATE"   value={ship.flag} />
            <Field label="LENGTH"       value={`${ship.length_m} m`} mono />
            <Field label="SPEED"        value={`${ship.speed_knots} kts`} mono />
            <Field label="HEADING"      value={`${ship.heading}°`} mono />
            <Field label="AIS STATUS"   value={ship.ais_status} color={aisColor} mono />
            <Field label="COORDINATES"  value={`${ship.lat.toFixed(4)}°N  ${ship.lng.toFixed(4)}°E`} mono />
            <Field label="LAST SEEN"    value={formatLocalTime(ship.last_seen)} mono />
          </div>

          {/* Intel assessment */}
          <div style={{ margin: '0 22px 14px', background: `${color}0c`, border: `1px solid ${color}30`, borderRadius: 8, padding: 13 }}>
            <div style={{ fontSize: 9, letterSpacing: '1.5px', color, fontWeight: 700, marginBottom: 6 }}>⚠ INTELLIGENCE ASSESSMENT</div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6 }}>{ship.alert_reason}</div>
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