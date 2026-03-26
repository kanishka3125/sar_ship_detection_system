import { useEffect, useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'

const RISK_COLORS = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }
const AIS_COLORS  = { ABSENT: '#ff2d55', SPOOFED: '#ffb830', PRESENT: '#00e676' }

/* ─────────────────────────────────────────
   Realistic Container Ship 3D Model
   ───────────────────────────────────────── */
function RealisticShip({ riskColor }) {
  const shipRef  = useRef()
  const radarRef = useRef()
  const propRef  = useRef()
  const smokeRef = useRef()

  useFrame(({ clock }, delta) => {
    // Very slow continuous rotation
    if (shipRef.current)  shipRef.current.rotation.y  += delta * 0.3
    // Fast spinning radar
    if (radarRef.current) radarRef.current.rotation.y += delta * 4
    // Spinning prop
    if (propRef.current)  propRef.current.rotation.x  += delta * 8
    // Gentle smoke rise
    if (smokeRef.current) {
      smokeRef.current.position.y = 1.82 + ((clock.getElapsedTime() * 0.4) % 0.5)
      smokeRef.current.material.opacity = 0.3 - ((clock.getElapsedTime() * 0.4) % 0.5) * 0.5
    }
  })

  // ── PBR-style materials ──
  const hullSideMat   = new THREE.MeshStandardMaterial({ color:'#3a4a5a', roughness:0.6, metalness:0.7 })
  const hullBottomMat = new THREE.MeshStandardMaterial({ color:'#8B2500', roughness:0.7, metalness:0.4 }) // anti-fouling red
  const deckMat       = new THREE.MeshStandardMaterial({ color:'#2d3d2d', roughness:0.8, metalness:0.3 })
  const superMat      = new THREE.MeshStandardMaterial({ color:'#d4cec6', roughness:0.5, metalness:0.2 }) // cream white
  const bridgeMat     = new THREE.MeshStandardMaterial({ color:'#bbb5ad', roughness:0.4, metalness:0.3 })
  const glassMat      = new THREE.MeshStandardMaterial({ color:'#1a3a5a', roughness:0.05, metalness:0.9, transparent:true, opacity:0.8 })
  const steelMat      = new THREE.MeshStandardMaterial({ color:'#5a6070', roughness:0.3, metalness:0.9 })
  const darkSteelMat  = new THREE.MeshStandardMaterial({ color:'#1a1e26', roughness:0.2, metalness:0.95 })
  const accentMat     = new THREE.MeshStandardMaterial({ color: riskColor, emissive: riskColor, emissiveIntensity:0.4, roughness:0.3, metalness:0.5 })
  const navLightRed   = new THREE.MeshStandardMaterial({ color:'#ff2200', emissive:'#ff2200', emissiveIntensity:3, toneMapped:false })
  const navLightGrn   = new THREE.MeshStandardMaterial({ color:'#00ee44', emissive:'#00ee44', emissiveIntensity:3, toneMapped:false })
  const navLightWht   = new THREE.MeshStandardMaterial({ color:'#ffffff', emissive:'#ffffff', emissiveIntensity:3, toneMapped:false })

  const containerColors = [
    '#CC2200','#003399','#1166CC','#AA8800','#226600',
    '#993300','#004488','#CC6600','#115500','#882200',
    '#0044AA','#886600','#CC4400','#0066BB','#336600',
    '#CC3300','#005599','#CC7700','#334400','#770022',
  ]

  return (
    <group ref={shipRef} position={[0, 0, 0]}>

      {/* ════════════════════════════════
          HULL
      ════════════════════════════════ */}

      {/* Main hull sides — above waterline (dark gray) */}
      <mesh position={[0, 0.12, 0]} material={hullSideMat}>
        <boxGeometry args={[6.6, 0.52, 1.14]} />
      </mesh>

      {/* Hull — anti-fouling red (below waterline) */}
      <mesh position={[0, -0.26, 0]} material={hullBottomMat}>
        <boxGeometry args={[6.4, 0.36, 1.08]} />
      </mesh>

      {/* Waterline stripe (narrow white band) */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[6.62, 0.04, 1.16]} />
        <meshStandardMaterial color="#f0ece6" roughness={0.5} />
      </mesh>

      {/* Bow — pointed forward section */}
      <mesh position={[3.55, 0.12, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.575, 1.5, 4]} rotation={[0, Math.PI/4, Math.PI/2]} />
        <primitive object={hullSideMat} attach="material" />
      </mesh>
      <mesh position={[3.55, -0.26, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.545, 1.4, 4]} rotation={[0, Math.PI/4, Math.PI/2]} />
        <primitive object={hullBottomMat} attach="material" />
      </mesh>

      {/* Stern — rectangular */}
      <mesh position={[-3.35, 0.12, 0]} material={hullSideMat}>
        <boxGeometry args={[0.18, 0.52, 1.08]} />
      </mesh>

      {/* Keel */}
      <mesh position={[0, -0.46, 0]} material={darkSteelMat}>
        <boxGeometry args={[6.0, 0.08, 0.22]} />
      </mesh>

      {/* Main deck */}
      <mesh position={[0, 0.395, 0]} material={deckMat}>
        <boxGeometry args={[6.6, 0.06, 1.14]} />
      </mesh>


      {/* ════════════════════════════════
          CONTAINERS (forward section)
      ════════════════════════════════ */}
      {(() => {
        const containers = []
        const cols   = 6  // along ship length
        const rows   = 3  // stacked height
        const lanes  = 2  // across width
        let   ci     = 0
        for (let r = 0; r < rows; r++) {
          for (let col = 0; col < cols; col++) {
            for (let lane = 0; lane < lanes; lane++) {
              const x    = 0.9 + col * 0.88 - 2.2
              const y    = 0.6 + r * 0.38
              const z    = (lane - 0.5) * 0.52
              const cMat = new THREE.MeshStandardMaterial({
                color: containerColors[ci % containerColors.length],
                roughness: 0.7, metalness: 0.3,
              })
              ci++
              containers.push(
                <mesh key={`c${col}-${r}-${lane}`} position={[x, y, z]} material={cMat}>
                  <boxGeometry args={[0.82, 0.34, 0.46]} />
                </mesh>
              )
              // Container door outline detail
              containers.push(
                <mesh key={`cd${col}-${r}-${lane}`} position={[x - 0.41, y, z]}>
                  <boxGeometry args={[0.005, 0.3, 0.44]} />
                  <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
                </mesh>
              )
            }
          }
        }
        return containers
      })()}


      {/* ════════════════════════════════
          SUPERSTRUCTURE (aft island)
      ════════════════════════════════ */}

      {/* Main superstructure block */}
      <mesh position={[-2.0, 0.9, 0]} material={superMat}>
        <boxGeometry args={[1.6, 1.0, 1.05]} />
      </mesh>

      {/* Second level */}
      <mesh position={[-2.0, 1.65, 0]} material={superMat}>
        <boxGeometry args={[1.45, 0.6, 0.95]} />
      </mesh>

      {/* Bridge deck */}
      <mesh position={[-2.0, 2.1, 0]} material={bridgeMat}>
        <boxGeometry args={[1.35, 0.5, 0.9]} />
      </mesh>

      {/* Bridge wing extensions */}
      <mesh position={[-2.0, 2.1, 0.62]} material={bridgeMat}>
        <boxGeometry args={[0.85, 0.35, 0.22]} />
      </mesh>
      <mesh position={[-2.0, 2.1, -0.62]} material={bridgeMat}>
        <boxGeometry args={[0.85, 0.35, 0.22]} />
      </mesh>

      {/* Bridge windows (glass strip) */}
      <mesh position={[-1.33, 2.14, 0]} material={glassMat}>
        <boxGeometry args={[0.03, 0.22, 0.76]} />
      </mesh>
      {/* Individual window frames */}
      {[-0.28,-0.14,0,0.14,0.28].map((z,i) => (
        <mesh key={`bw${i}`} position={[-1.31, 2.12, z]}>
          <boxGeometry args={[0.025, 0.18, 0.025]} />
          <meshStandardMaterial color="#888888" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}

      {/* Portholes on superstructure sides */}
      {[0.5, 0.9, 1.3].map((y,i) => (
        [0.53, -0.53].map((z,j) => (
          <mesh key={`ph${i}${j}`} position={[-1.28, y, z]}>
            <cylinderGeometry args={[0.045, 0.045, 0.02, 10]} rotation={[0, 0, Math.PI/2]} />
            <meshStandardMaterial color="#1a3a5a" roughness={0.1} metalness={0.9} />
          </mesh>
        ))
      ))}

      {/* Life boat davits */}
      {[-0.3, 0.3].map((z,i) => (
        <group key={`lb${i}`} position={[-1.35, 1.08, i === 0 ? 0.6 : -0.6]}>
          <mesh rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.04, 0.35, 0.04]} />
            <primitive object={steelMat} attach="material" />
          </mesh>
          <mesh position={[0.06, 0.2, 0]}>
            <boxGeometry args={[0.18, 0.1, 0.08]} />
            <meshStandardMaterial color="#ff9900" roughness={0.6} metalness={0.2} />
          </mesh>
        </group>
      ))}


      {/* ════════════════════════════════
          FUNNEL / SMOKESTACK
      ════════════════════════════════ */}
      {/* Main stack body */}
      <mesh position={[-2.35, 2.5, 0]} material={darkSteelMat}>
        <cylinderGeometry args={[0.2, 0.26, 1.0, 12]} />
      </mesh>
      {/* Company color band */}
      <mesh position={[-2.35, 2.88, 0]}>
        <cylinderGeometry args={[0.205, 0.205, 0.22, 12]} />
        <primitive object={accentMat} attach="material" />
      </mesh>
      {/* Stack top rim */}
      <mesh position={[-2.35, 3.02, 0]} material={darkSteelMat}>
        <torusGeometry args={[0.21, 0.025, 8, 20]} />
      </mesh>
      {/* Smoke puff */}
      <mesh ref={smokeRef} position={[-2.35, 1.85, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#888890" transparent opacity={0.3} roughness={1} />
      </mesh>


      {/* ════════════════════════════════
          MAST & RADAR
      ════════════════════════════════ */}
      {/* Main mast */}
      <mesh position={[-1.7, 2.68, 0]} material={steelMat}>
        <cylinderGeometry args={[0.025, 0.03, 1.0, 8]} />
      </mesh>
      {/* Cross arm */}
      <mesh position={[-1.7, 3.08, 0]} material={steelMat}>
        <boxGeometry args={[0.05, 0.04, 0.7]} />
      </mesh>
      {/* Navigation lights on cross arm */}
      <mesh position={[-1.7, 3.08, 0.35]} material={navLightGrn}>
        <sphereGeometry args={[0.04, 6, 6]} />
      </mesh>
      <mesh position={[-1.7, 3.08, -0.35]} material={navLightRed}>
        <sphereGeometry args={[0.04, 6, 6]} />
      </mesh>

      {/* Radar mast extension */}
      <mesh position={[-1.7, 3.2, 0]} material={steelMat}>
        <cylinderGeometry args={[0.018, 0.022, 0.55, 6]} />
      </mesh>
      {/* Spinning radar dish */}
      <group ref={radarRef} position={[-1.7, 3.5, 0]}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.3, 0.035, 20]} />
          <meshStandardMaterial color="#ddddcc" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <torusGeometry args={[0.3, 0.018, 8, 28]} />
          <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.0, 0.12, 0.1, 4]} />
          <meshStandardMaterial color="#cccccc" roughness={0.3} metalness={0.9} />
        </mesh>
      </group>

      {/* Top masthead light */}
      <mesh position={[-1.7, 3.78, 0]} material={navLightWht}>
        <sphereGeometry args={[0.05, 8, 8]} />
      </mesh>


      {/* ════════════════════════════════
          STERN DETAILS
      ════════════════════════════════ */}

      {/* Stern flag pole */}
      <mesh position={[-3.3, 0.8, 0]} material={steelMat}>
        <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
      </mesh>
      {/* Flag */}
      <mesh position={[-3.15, 1.1, 0.15]}>
        <boxGeometry args={[0.3, 0.18, 0.01]} />
        <meshStandardMaterial color={riskColor} roughness={0.8} metalness={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Stern light */}
      <mesh position={[-3.35, 0.5, 0]} material={navLightWht}>
        <sphereGeometry args={[0.045, 6, 6]} />
      </mesh>

      {/* Bow anchor chain hawse */}
      {[-0.3, 0.3].map((z,i) => (
        <mesh key={`haw${i}`} position={[3.2, 0.0, z]}>
          <cylinderGeometry args={[0.06, 0.06, 0.14, 8]} rotation={[Math.PI/2, 0, 0]} />
          <primitive object={darkSteelMat} attach="material" />
        </mesh>
      ))}

      {/* Deck crane / derrick (forward) */}
      <mesh position={[1.5, 0.52, 0.55]} material={steelMat}>
        <cylinderGeometry args={[0.025, 0.03, 0.8, 6]} />
      </mesh>
      <mesh position={[1.7, 0.88, 0.55]} rotation={[0, 0, -0.5]} material={steelMat}>
        <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
      </mesh>

      {/* Deck winches */}
      {[-1.5, 2.5].map((x,i) => (
        <mesh key={`wch${i}`} position={[x, 0.46, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.14, 10]} rotation={[Math.PI/2,0,0]} />
          <primitive object={steelMat} attach="material" />
        </mesh>
      ))}

      {/* ── Propeller ── */}
      <group ref={propRef} position={[-3.32, -0.18, 0]}>
        {[0,1,2,3].map(i => (
          <mesh key={i} rotation={[i * Math.PI/2, 0, 0]}>
            <boxGeometry args={[0.07, 0.48, 0.06]} />
            <meshStandardMaterial color="#4a3828" metalness={0.95} roughness={0.1} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.075, 10, 10]} />
          <primitive object={darkSteelMat} attach="material" />
        </mesh>
      </group>

      {/* Rudder */}
      <mesh position={[-3.32, -0.26, 0]}>
        <boxGeometry args={[0.05, 0.4, 0.22]} />
        <primitive object={hullBottomMat} attach="material" />
      </mesh>

      {/* Wake foam */}
      {[0,1,2].map(i => (
        <mesh key={`wk${i}`} position={[-3.3 - i*0.35, -0.08, (i%2===0?1:-1)*0.2*(i+1)*0.15]}>
          <boxGeometry args={[0.28+i*0.1, 0.04, 0.15+i*0.06]} />
          <meshStandardMaterial color="#b8d4ee" transparent opacity={0.5-i*0.12} roughness={1} />
        </mesh>
      ))}

    </group>
  )
}

function LoadingSpinner() {
  const r = useRef()
  useFrame((_,d) => { if(r.current) r.current.rotation.y += d*2 })
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
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:9, letterSpacing:'1.5px', color:'var(--text-dim)', fontWeight:600 }}>{label}</span>
      <span style={{
        fontSize: mono ? 12 : 13,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-main)',
        fontWeight:600, color: color||'var(--text-primary)', lineHeight:1.3,
      }}>{value}</span>
    </div>
  )
}

function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 85 ? '#ff2d55' : pct >= 70 ? '#ffb830' : '#00e676'
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:9, letterSpacing:'1.5px', color:'var(--text-dim)', fontWeight:600 }}>DETECTION CONFIDENCE</span>
        <span style={{ fontSize:13, fontFamily:'var(--font-mono)', color, fontWeight:700 }}>{pct}%</span>
      </div>
      <div style={{ height:5, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
        <div style={{
          width:`${pct}%`, height:'100%', borderRadius:3,
          background:`linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow:`0 0 12px ${color}`,
          transition:'width 0.8s ease',
        }} />
      </div>
    </div>
  )
}

export default function ShipModal({ ship, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!ship) return null

  const color    = RISK_COLORS[ship.risk]
  const aisColor = AIS_COLORS[ship.ais_status]

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position:'fixed', inset:0, zIndex:2000,
        background:'rgba(2,5,12,0.92)',
        display:'flex', alignItems:'center', justifyContent:'center',
        backdropFilter:'blur(14px)',
        animation:'fadeIn 0.2s ease',
      }}
    >
      <div style={{
        width:'min(980px, 96vw)',
        height:'min(610px, 92vh)',
        background:'linear-gradient(135deg, #090f1c 0%, #050810 100%)',
        border:`1px solid ${color}55`,
        borderRadius:14,
        display:'flex',
        overflow:'hidden',
        boxShadow:`0 0 0 1px ${color}18, 0 28px 100px ${color}18, 0 0 80px rgba(0,0,0,0.95)`,
        animation:'modalOpen 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>

        {/* ── Left: 3D Canvas ── */}
        <div style={{
          flex:'0 0 50%',
          background:`radial-gradient(ellipse at 50% 30%, ${color}12 0%, #04080f 65%)`,
          borderRight:`1px solid ${color}22`,
          display:'flex', flexDirection:'column',
        }}>
          {/* Header */}
          <div style={{
            padding:'14px 18px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            borderBottom:`1px solid ${color}22`, flexShrink:0,
            background:`${color}07`,
          }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'2px', color }}>◈ 3D VESSEL PROFILE</div>
              <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginTop:2 }}>
                {ship.vessel_type.toUpperCase()} · {ship.length_m}M · IMO REGISTERED
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background:'rgba(255,45,85,0.1)', color:'#ff2d55',
                border:'1px solid rgba(255,45,85,0.3)', borderRadius:6,
                width:30, height:30, fontSize:16, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700,
                transition:'all 0.15s',
              }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,45,85,0.25)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(255,45,85,0.1)'}
            >✕</button>
          </div>

          {/* Canvas */}
          <div style={{ flex:1, position:'relative' }}>
            <Canvas camera={{ position:[0, 3, 9.5], fov:40 }} gl={{ antialias:true }}>
              <color attach="background" args={['#04080f']} />
              {/* Key light (sun side) */}
              <directionalLight position={[8, 10, 6]}   intensity={2.0} color="#fff8f0" castShadow />
              {/* Fill light */}
              <directionalLight position={[-6, 4, -4]}  intensity={0.6} color="#aabbcc" />
              {/* Rim light for depth */}
              <directionalLight position={[0, -4, -8]}  intensity={0.3} color="#334466" />
              <ambientLight intensity={0.35} />
              {/* Water reflection tint */}
              <pointLight position={[0, -3, 0]} intensity={0.4} color="#1144aa" />
              <Suspense fallback={<LoadingSpinner />}>
                <RealisticShip riskColor={color} />
              </Suspense>
              <OrbitControls enablePan={false} minDistance={5} maxDistance={18} enableDamping dampingFactor={0.05} />
              <fog attach="fog" args={['#04080f', 20, 40]} />
            </Canvas>
            <div style={{
              position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
              fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)',
              background:'rgba(4,8,15,0.75)', padding:'3px 14px', borderRadius:12,
              backdropFilter:'blur(6px)', border:'1px solid rgba(0,212,255,0.07)',
              whiteSpace:'nowrap',
            }}>
              DRAG TO ROTATE · SCROLL TO ZOOM
            </div>
          </div>
        </div>

        {/* ── Right: Intelligence Profile ── */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
          {/* Header */}
          <div style={{ padding:'18px 22px', borderBottom:`1px solid ${color}22`, background:`${color}08`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div>
                <div style={{ fontSize:21, fontWeight:700, color:'var(--text-primary)', letterSpacing:1, lineHeight:1.1 }}>
                  {ship.vessel_name}
                </div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginTop:4 }}>
                  {ship.id} · MMSI {ship.mmsi} · FLAG: {ship.flag}
                </div>
              </div>
              <div style={{
                background:`${color}1e`, color, padding:'7px 16px',
                borderRadius:6, fontSize:12, fontWeight:700, letterSpacing:'2px',
                border:`1px solid ${color}55`, flexShrink:0,
                boxShadow:`0 0 18px ${color}1a`,
              }}>
                {ship.risk} RISK
              </div>
            </div>
          </div>

          {/* Fields */}
          <div style={{ padding:'18px 22px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, flex:1 }}>
            <Field label="VESSEL TYPE"  value={ship.vessel_type} />
            <Field label="FLAG STATE"   value={ship.flag} />
            <Field label="LENGTH"       value={`${ship.length_m} m`} mono />
            <Field label="SPEED"        value={`${ship.speed_knots} kts`} mono />
            <Field label="HEADING"      value={`${ship.heading}°`} mono />
            <Field label="AIS STATUS"   value={ship.ais_status}  color={aisColor} mono />
            <Field label="COORDINATES"  value={`${ship.lat.toFixed(4)}°N  ${ship.lng.toFixed(4)}°E`} mono />
            <Field label="LAST SEEN"    value={new Date(ship.last_seen).toUTCString().slice(5,22)} mono />
          </div>

          {/* Alert reason */}
          <div style={{ margin:'0 22px 14px', background:`${color}0c`, border:`1px solid ${color}30`, borderRadius:8, padding:13 }}>
            <div style={{ fontSize:9, letterSpacing:'1.5px', color, fontWeight:700, marginBottom:6 }}>⚠ INTELLIGENCE ASSESSMENT</div>
            <div style={{ fontSize:12, color:'var(--text-primary)', lineHeight:1.6 }}>{ship.alert_reason}</div>
          </div>

          {/* Confidence */}
          <div style={{ margin:'0 22px 18px' }}>
            <ConfidenceBar value={ship.confidence} />
          </div>
        </div>
      </div>
    </div>
  )
}
