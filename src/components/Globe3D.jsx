import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html, useTexture } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'
import { validateCoords } from '../utils/timeUtils'

const RISK_COLORS = { HIGH: '#ff2d55', MEDIUM: '#ffb830', LOW: '#00e676' }

/* Convert lat/lng → stable 3D Vector3 on unit sphere */
function latLngToVec3(lat, lng, radius = 1.025) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  ]
}

/* ── Earth with real texture ── */
function EarthMesh({ globeRef }) {
  const [dayMap, bumpMap, specMap] = useTexture([
    'https://unpkg.com/three-globe/example/img/earth-day.jpg',
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    'https://unpkg.com/three-globe/example/img/earth-water.png',
  ])

  useFrame((_, delta) => { if (globeRef.current) globeRef.current.rotation.y += delta * 0.08 })

  return (
    <group ref={globeRef}>
      <mesh>
        <sphereGeometry args={[1, 72, 72]} />
        <meshPhongMaterial map={dayMap} bumpMap={bumpMap} bumpScale={0.04} specularMap={specMap} specular={new THREE.Color('#226688')} shininess={12} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.005, 32, 32]} />
        <meshBasicMaterial color="#4488cc" transparent opacity={0.03} side={THREE.FrontSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.08, 32, 32]} />
        <meshBasicMaterial color="#1155bb" transparent opacity={0.07} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.015, 48, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.05} side={THREE.FrontSide} />
      </mesh>
    </group>
  )
}

/* ── Fallback plain globe ── */
function EarthFallback({ globeRef }) {
  useFrame((_, delta) => { if (globeRef.current) globeRef.current.rotation.y += delta * 0.08 })
  return (
    <group ref={globeRef}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhongMaterial color="#0d3060" emissive="#040f1e" specular="#226688" shininess={15} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.001, 36, 18]} />
        <meshBasicMaterial color="#00d4ff" wireframe transparent opacity={0.04} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.08, 32, 32]} />
        <meshBasicMaterial color="#1155bb" transparent opacity={0.07} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

/* ── Pulsing ship marker — position is STABLE via useMemo ── */
function ShipMarker({ ship, onSelect }) {
  const ref     = useRef()
  const ringRef = useRef()
  const [hovered, setHovered] = useState(false)

  const color    = RISK_COLORS[ship.risk]
  const threeCol = useMemo(() => new THREE.Color(color), [color])
  const isHigh   = ship.risk === 'HIGH'
  const size     = isHigh ? 0.026 : ship.risk === 'MEDIUM' ? 0.018 : 0.013

  // STABLE position: computed once per ship id/coords, never re-computed on unrelated renders
  const pos = useMemo(() => {
    const { lat, lng } = validateCoords(ship.lat, ship.lng)
    return latLngToVec3(lat, lng, 1.025)
  }, [ship.id, ship.lat, ship.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current) {
      const sc = 1 + Math.sin(t * (isHigh ? 3.5 : 2.2)) * (isHigh ? 0.38 : 0.14)
      ref.current.scale.setScalar(sc)
    }
    if (ringRef.current && isHigh) {
      const phase = (t * 1.5) % 1
      ringRef.current.scale.setScalar(1 + phase * 2.6)
      ringRef.current.material.opacity = 0.75 * (1 - phase)
    }
  })

  return (
    <group
      position={pos}
      onClick={(e) => { e.stopPropagation(); onSelect(ship) }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Core glow sphere */}
      <mesh ref={ref}>
        <sphereGeometry args={[size, 10, 10]} />
        <meshStandardMaterial color={threeCol} emissive={threeCol} emissiveIntensity={hovered ? 4.5 : (isHigh ? 3.2 : 1.9)} toneMapped={false} />
      </mesh>

      {/* Spike (vertical pin) */}
      <mesh>
        <coneGeometry args={[size * 0.38, size * 4, 6]} />
        <meshStandardMaterial color={threeCol} emissive={threeCol} emissiveIntensity={1.2} transparent opacity={0.55} toneMapped={false} />
      </mesh>

      {/* Pulse ring for HIGH */}
      {isHigh && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.0, size * 1.8, 28]} />
          <meshBasicMaterial color={threeCol} transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Html distanceFactor={4} style={{ pointerEvents: 'none', transform: 'translateX(-50%)' }}>
          <div style={{
            background: 'rgba(4,8,20,0.97)', border: `1px solid ${color}55`,
            borderRadius: '8px', padding: '9px 13px',
            fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap',
            boxShadow: `0 6px 28px ${color}33, 0 0 0 1px ${color}22`,
          }}>
            <div style={{ color, fontWeight: 700, fontSize: '12px' }}>{ship.vessel_name}</div>
            <div style={{ color: '#7a95b8', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
              {ship.id} · {ship.vessel_type}
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
              <span style={{ background: `${color}22`, color, padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 700 }}>{ship.risk}</span>
              <span style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', padding: '1px 6px', borderRadius: '3px', fontSize: '9px' }}>AIS:{ship.ais_status}</span>
            </div>
            <div style={{ color: '#4488ff', fontSize: '9px', fontFamily: 'JetBrains Mono, monospace', marginTop: '5px', letterSpacing: '0.5px' }}>
              CLICK TO INVESTIGATE →
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

/* ── Globe Scene ── */
function GlobeScene({ ships, onSelectShip }) {
  const globeRef = useRef()

  // Stable: memoize valid ships to prevent re-renders
  const validShips = useMemo(() =>
    ships.filter(s => validateCoords(s.lat, s.lng).valid),
    [ships]
  )

  return (
    <>
      <color attach="background" args={['#030610']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 3, 5]}    intensity={2.1} color="#fff8f0" />
      <directionalLight position={[-6, -2, -5]} intensity={0.16} color="#2244aa" />

      <Stars radius={90} depth={60} count={6000} factor={3} saturation={0.2} fade speed={0.4} />

      <Suspense fallback={<EarthFallback globeRef={globeRef} />}>
        <EarthMesh globeRef={globeRef} />
      </Suspense>

      {/* Ship markers — NOT children of globe group, so they don't rotate with it */}
      {validShips.map(ship => (
        <ShipMarker key={ship.id} ship={ship} onSelect={onSelectShip} />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={1.4}
        maxDistance={5}
        autoRotate
        autoRotateSpeed={0.3}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.5}
      />
    </>
  )
}

/* ── Legend ── */
function Legend({ ships }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, zIndex: 10,
      background: 'rgba(4,8,20,0.90)', border: '1px solid rgba(0,212,255,0.16)',
      borderRadius: '9px', padding: '12px 16px',
      fontFamily: 'Space Grotesk, sans-serif', backdropFilter: 'blur(14px)',
    }}>
      <div style={{ color: '#00d4ff', fontWeight: 700, fontSize: '11px', letterSpacing: '2px', marginBottom: '8px' }}>
        🌍 LIVE GLOBE · SHIP POSITIONS
      </div>
      {[['HIGH','#ff2d55'],['MEDIUM','#ffb830'],['LOW','#00e676']].map(([r,c]) => (
        <div key={r} style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 5 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:c, boxShadow:`0 0 8px ${c}, 0 0 16px ${c}55` }} />
          <span style={{ fontSize:11, color:c, fontWeight:500 }}>{r}</span>
          <span style={{ marginLeft:'auto', fontSize:11, color:'#3d5478', fontFamily:'JetBrains Mono,monospace' }}>
            {ships.filter(s=>s.risk===r).length}
          </span>
        </div>
      ))}
      <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(0,212,255,0.1)', fontSize:10, color:'#3d5478', lineHeight:1.5 }}>
        DRAG TO ROTATE · SCROLL TO ZOOM<br/>CLICK MARKER FOR DETAILS
      </div>
    </div>
  )
}

export default function Globe3D({ ships, onSelectShip }) {
  return (
    <div style={{ width:'100%', height:'100%', position:'relative' }}>
      <Canvas
        camera={{ position:[0, 1.4, 2.8], fov:44 }}
        gl={{ antialias:true, alpha:false, powerPreference:'high-performance' }}
      >
        <Suspense fallback={null}>
          <GlobeScene ships={ships} onSelectShip={onSelectShip} />
        </Suspense>
      </Canvas>
      <Legend ships={ships} />
    </div>
  )
}
