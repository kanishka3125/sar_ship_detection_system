import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html, useTexture } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'
import { validateCoords } from '../utils/timeUtils'
import { RESTRICTED_ZONES } from '../data/zones'

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

/* ── Realistic Earth with Satellite Textures & Clouds ── */
function EarthMesh({ globeRef }) {
  const [dayMap, bumpMap, specMap, skyMap] = useTexture([
    '/models/earth_color_vibrant.jpg',
    '/models/earth_topology_vibrant.png',
    '/models/earth_water_vibrant.png',
    '/models/night_sky.png'
  ])

  // Enhance texture sharpness and color accuracy
  useMemo(() => {
    dayMap.colorSpace = THREE.SRGBColorSpace
    skyMap.colorSpace = THREE.SRGBColorSpace
    ;[dayMap, bumpMap, specMap].forEach(t => {
      t.anisotropy = 16
    })
  }, [dayMap, bumpMap, specMap, skyMap])

  useFrame((_, delta) => {
    if (globeRef.current) globeRef.current.rotation.y += delta * 0.04
  })

  return (
    <group ref={globeRef}>
      {/* 1. Main Earth Sphere (Terrain + Oceans) */}
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          map={dayMap}
          bumpMap={bumpMap}
          bumpScale={0.02}
          roughnessMap={specMap}
          roughness={0.75}
          metalness={0.1}
        />
      </mesh>

      {/* 3. Milky Way Sky Background */}
      <mesh scale={[100, 100, 100]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial map={skyMap} side={THREE.BackSide} />
      </mesh>

      {/* 4. Very tight Atmospheric Glow */}
      <mesh>
        <sphereGeometry args={[1.002, 64, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.06} side={THREE.FrontSide} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 5. Outer Atmospheric Halo */}
      <mesh scale={[1.015, 1.015, 1.015]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color="#aabbff" transparent opacity={0.08} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
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

/**
 * ZoneOutlines
 * Renders restricted maritime zones as 3D lines on the globe.
 */
function ZoneOutlines() {
  const zoneLines = useMemo(() => {
    return RESTRICTED_ZONES.map(zone => {
      const points = zone.positions.map(([lat, lng]) => {
        const [x, y, z] = latLngToVec3(lat, lng, 1.005)
        return new THREE.Vector3(x, y, z)
      })
      // Close the loop
      const [x0, y0, z0] = latLngToVec3(zone.positions[0][0], zone.positions[0][1], 1.005)
      points.push(new THREE.Vector3(x0, y0, z0))
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      return { geometry, color: zone.color, name: zone.name }
    })
  }, [])

  return (
    <group>
      {zoneLines.map((line, i) => (
        <line key={i} geometry={line.geometry}>
          <lineBasicMaterial color={line.color} linewidth={2} transparent opacity={0.6} />
        </line>
      ))}
    </group>
  )
}

/* ── Pulsing ship marker — position is STABLE via useMemo ── */
function ShipMarker({ ship, onSelect, environment }) {
  const ref     = useRef()
  const ringRef = useRef()
  const [hovered, setHovered] = useState(false)

  const isViolation = ship.isViolation
  const color    = isViolation ? '#ff2d55' : RISK_COLORS[ship.risk]
  const threeCol = useMemo(() => new THREE.Color(color), [color])
  const isHigh   = ship.risk === 'HIGH' || isViolation
  const size     = isViolation ? 0.032 : isHigh ? 0.026 : ship.risk === 'MEDIUM' ? 0.018 : 0.013

  // STABLE position: computed once per ship id/coords, never re-computed on unrelated renders
  const pos = useMemo(() => {
    const { lat, lng } = validateCoords(ship.lat, ship.lng)
    return latLngToVec3(lat, lng, 1.025)
  }, [ship.id, ship.lat, ship.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current) {
      const speed = isViolation ? 5.5 : isHigh ? 3.5 : 2.2
      const amp   = isViolation ? 0.55 : isHigh ? 0.38 : 0.14
      const sc = 1 + Math.sin(t * speed) * amp
      ref.current.scale.setScalar(sc)

      // Sea Condition Bobbing
      if (ship.env && environment?.seaEnabled) {
        const seaAmp = ship.env.seaState === 'Rough' ? 0.025 : ship.env.seaState === 'Moderate' ? 0.012 : 0.003
        const seaSpeed = ship.env.seaState === 'Rough' ? 3.5 : ship.env.seaState === 'Moderate' ? 2.0 : 1.0
        ref.current.position.y = Math.sin(t * seaSpeed + ship.id.length) * seaAmp
      } else {
        ref.current.position.y = 0
      }
    }
    if (ringRef.current && isHigh) {
      const ringSpeed = isViolation ? 2.5 : 1.5
      const phase = (t * ringSpeed) % 1
      ringRef.current.scale.setScalar(1 + phase * (isViolation ? 3.5 : 2.6))
      ringRef.current.material.opacity = 0.8 * (1 - phase)
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
        <meshStandardMaterial color={threeCol} emissive={threeCol} emissiveIntensity={hovered ? 4.5 : (isViolation ? 5.0 : isHigh ? 3.2 : 1.9)} toneMapped={false} />
      </mesh>

      {/* Spike (vertical pin) */}
      <mesh>
        <coneGeometry args={[size * 0.38, size * 4, 6]} />
        <meshStandardMaterial color={threeCol} emissive={threeCol} emissiveIntensity={1.2} transparent opacity={0.55} toneMapped={false} />
      </mesh>

      {/* Pulse ring for HIGH/Violation */}
      {isHigh && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.0, size * (isViolation ? 2.5 : 1.8), 28]} />
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
            <div style={{ color, fontWeight: 700, fontSize: '12px' }}>
              {isViolation && <span style={{ marginRight: 6 }}>⚠</span>}
              {ship.vessel_name}
            </div>
            <div style={{ color: '#7a95b8', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
              {ship.id} · {ship.vessel_type}
            </div>
            {isViolation && (
              <div style={{ color: '#ff2d55', fontSize: '10px', fontWeight: 800, marginTop: 4, letterSpacing: 1 }}>
                ZONE VIOLATION: {ship.violatedZoneName}
              </div>
            )}
            <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
              <span style={{ background: `${color}22`, color, padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 700 }}>{ship.risk}</span>
              <span style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', padding: '1px 6px', borderRadius: '3px', fontSize: '9px' }}>AIS:{ship.ais_status}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

/* ── Globe Scene ── */
function GlobeScene({ ships, onSelectShip, environment }) {
  const globeRef = useRef()

  const isNight = environment?.time === 'night'

  // Stable: memoize valid ships to prevent re-renders
  const validShips = useMemo(() =>
    ships.filter(s => validateCoords(s.lat, s.lng).valid),
    [ships]
  )

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={isNight ? 0.15 : 0.6} color={isNight ? "#4466ff" : "#ffffff"} />
      {/* Primary Sun Light for Dramatic Day/Night effect */}
      <directionalLight 
        position={isNight ? [-8, -2, -4] : [8, 4, 6]} 
        intensity={isNight ? 0.4 : 3.0} 
        color={isNight ? "#99bbff" : "#ffffff"} 
      />
      {/* Soft fill light */}
      <directionalLight position={[-10, -2, -6]} intensity={isNight ? 0.1 : 0.3} color="#6688aa" />

      {/* Replacing subtle stars with the massive skyMap sphere placed in EarthMesh */}

      <Suspense fallback={<EarthFallback globeRef={globeRef} />}>
        <EarthMesh globeRef={globeRef} />
      </Suspense>

      {/* Restricted Zone Outlines on Sphere */}
      <ZoneOutlines />

      {/* Ship markers — NOT children of globe group, so they don't rotate with it */}
      {validShips.map(ship => (
        <ShipMarker key={ship.id} ship={ship} onSelect={onSelectShip} environment={environment} />
      ))}

      <OrbitControls
        makeDefault // Ensure it syncs optimally with the canvas
        enablePan={false}
        enableZoom={true}
        minDistance={1.15}
        maxDistance={4.5}
        autoRotate={true}
        autoRotateSpeed={0.2} // Slower, more majestic rotation
        enableDamping={true}
        dampingFactor={0.03} // Extremely smooth, continuous inertia
        rotateSpeed={0.35} // Smooth, heavier drag feel
        zoomSpeed={0.5} // Slows down scroll wheel stepping for a fluid zoom effect
      />
    </>
  )
}

/* ── Legend ── */
function Legend({ ships }) {
  const violations = ships.filter(s => s.isViolation).length
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
      
      {violations > 0 && (
        <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,45,85,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff2d55', boxShadow: '0 0 10px #ff2d55' }} className="violation-pulse-dot" />
            <span style={{ fontSize: 11, color: '#ff2d55', fontWeight: 800, letterSpacing: 0.5 }}>ZONE VIOLATIONS</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ff2d55', fontWeight: 800 }}>{violations}</span>
          </div>
          <style>{`
            @keyframes dotPulse { 0% { opacity: 1 } 50% { opacity: 0.3 } 100% { opacity: 1 } }
            .violation-pulse-dot { animation: dotPulse 1s infinite; }
          `}</style>
        </div>
      )}

      {[['HIGH','#ff2d55'],['MEDIUM','#ffb830'],['LOW','#00e676']].map(([r,c]) => (
        <div key={r} style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 5 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:c, boxShadow:`0 0 8px ${c}, 0 0 16px ${c}55` }} />
          <span style={{ fontSize:11, color:c, fontWeight:500 }}>{r}</span>
          <span style={{ marginLeft:'auto', fontSize:11, color:'#3d5478', fontFamily:'JetBrains Mono,monospace' }}>
            {ships.filter(s=>s.risk===r && !s.isViolation).length}
          </span>
        </div>
      ))}
      <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(0,212,255,0.1)', fontSize:10, color:'#3d5478', lineHeight:1.5 }}>
        DRAG TO ROTATE · SCROLL TO ZOOM<br/>CLICK MARKER FOR DETAILS
      </div>
    </div>
  )
}

export default function Globe3D({ ships, onSelectShip, environment }) {
  return (
    <div style={{ width:'100%', height:'100%', position:'relative' }}>
      <Canvas
        camera={{ position:[0, 1.2, 3.2], fov: 35 }} // Narrower FOV for cinematic telephoto Google Earth feel
        gl={{ 
          antialias: true, 
          alpha: false, 
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1
        }}
      >
        <Suspense fallback={null}>
          <GlobeScene ships={ships} onSelectShip={onSelectShip} environment={environment} />
        </Suspense>
      </Canvas>
      <Legend ships={ships} />
    </div>
  )
}
