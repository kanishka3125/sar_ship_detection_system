import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html, useTexture } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'
import { validateCoords } from '../utils/timeUtils'
import { RESTRICTED_ZONES } from '../data/zones'

const RISK_COLORS = { HIGH: '#ff0000', MEDIUM: '#ffb830', LOW: '#00e676' }

/* Convert lat/lng → stable 3D Vector3 on unit sphere */
function latLngToVec3(lat, lng, radius = 1.025) {
  // 1. Longitude Normalization: ((lng + 180) % 360) - 180
  const normalizedLng = ((lng + 180) % 360) - 180
  
  // 2. Degrees to Radians
  const latRad = lat * (Math.PI / 180)
  const lngRad = normalizedLng * (Math.PI / 180)

  // 3. Requested Projection Formula (Standard Geographic to Cartesian)
  // y is up, (0, 0, radius) is 0°N, 0°E
  const x = radius * Math.cos(latRad) * Math.sin(lngRad)
  const y = radius * Math.sin(latRad)
  const z = radius * Math.cos(latRad) * Math.cos(lngRad)

  return new THREE.Vector3(x, y, z)
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

  // Auto-rotation disabled for professional aesthetic

  return (
    <group ref={globeRef}>
      {/* 1. Main Earth Sphere (Terrain + Oceans) */}
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          map={dayMap}
          bumpMap={bumpMap}
          bumpScale={0.08}
          roughnessMap={specMap}
          roughness={1} 
          metalness={0.1}
          emissive="#112233" // Subtle oceanic depth
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* 3. Milky Way Sky Background */}
      <mesh scale={[100, 100, 100]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial map={skyMap} side={THREE.BackSide} />
      </mesh>

      {/* 4. Atmosphere Base Glow (Tight) */}
      <mesh>
        <sphereGeometry args={[1.005, 64, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} side={THREE.FrontSide} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 5. Prominent Blue Halo */}
      <mesh scale={[1.09, 1.09, 1.09]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color="#2266ff" transparent opacity={0.25} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      
      {/* 6. Soft Outer Rim */}
      <mesh scale={[1.12, 1.12, 1.12]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color="#1a44bb" transparent opacity={0.10} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ── Fallback plain globe ── */
function EarthFallback({ globeRef }) {
  // Auto-rotation disabled
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
        const vec = latLngToVec3(lat, lng, 1.005)
        return new THREE.Vector3(vec.x, vec.y, vec.z)
      })
      // Close the loop
      const vec0 = latLngToVec3(zone.positions[0][0], zone.positions[0][1], 1.005)
      points.push(new THREE.Vector3(vec0.x, vec0.y, vec0.z))
      
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
  const color    = isViolation ? '#ff0000' : RISK_COLORS[ship.risk]
  const threeCol = useMemo(() => new THREE.Color(color), [color])
  const isHigh   = ship.risk === 'HIGH' || isViolation
  const size     = isViolation ? 0.032 : isHigh ? 0.026 : ship.risk === 'MEDIUM' ? 0.018 : 0.013

  // 1:1 Mapping: Pre-calculate stable position once (No drift)
  const pos = useMemo(() => latLngToVec3(ship.lat, ship.lng), [ship.lat, ship.lng])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current) {
      const speed = isViolation ? 5.5 : isHigh ? 3.5 : 2.2
      const amp   = isViolation ? 0.55 : isHigh ? 0.38 : 0.14
      const sc = 1 + Math.sin(t * speed) * amp
      ref.current.scale.setScalar(sc)

      // Sea Condition Bobbing (Removed drift-causing logic, now always 0)
      ref.current.position.y = 0
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
      {/* 3D Point: Stable and locked to its lat/lng position (Zero Offset) */}
      <mesh ref={ref}>
        <sphereGeometry args={[size * 0.8, 16, 16]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={hovered ? 2.5 : (isViolation ? 3.0 : 1.2)} 
          toneMapped={false} 
        />
      </mesh>

      {/* Subtle pulse ring ONLY for high risk/violation (not a massive aura) */}
      {(isHigh || hovered) && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.2, size * (isViolation ? 2.5 : 1.8), 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Html distanceFactor={4} style={{ pointerEvents: 'none', transform: 'translateX(-50%)' }}>
          <div style={{
            background: 'rgba(4,8,20,0.95)', border: `1px solid #ff0000aa`,
            borderRadius: '2px', padding: '4px 8px',
            fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
            boxShadow: `0 4px 15px rgba(255,0,0,0.25)`,
          }}>
            <div style={{ color: '#ff0000', fontWeight: 700, fontSize: '10px', letterSpacing: '0.5px' }}>{ship.vessel_name}</div>
          </div>
        </Html>
      )}
    </group>
  )
}

/* ── Globe Scene ── */
function GlobeScene({ ships, onSelectShip, environment, onViewChange, viewState, visible }) {
  const globeRef = useRef()
  const { camera } = useThree()
  const [diving, setDiving] = useState(false)
  const [targetPoint, setTargetPoint] = useState(null)

  // Handle ship selection with a "Dive" animation
  const handleSelect = useCallback((ship) => {
    const vec = latLngToVec3(ship.lat, ship.lng, 1.05)
    setTargetPoint(vec)
    setDiving(true)
    
    // Smooth transition hand-off to Leaflet
    setTimeout(() => {
      onViewChange({ center: [ship.lat, ship.lng], zoom: 8 })
      setDiving(false)
    }, 1200)

    onSelectShip(ship)
  }, [onSelectShip, onViewChange])

  useFrame((state, delta) => {
    if (diving && targetPoint) {
      // Dive camera toward the target point
      camera.position.lerp(targetPoint, 0.05)
      camera.lookAt(0, 0, 0)
    }
  })
  const controlsRef = useRef()

  const isNight = environment?.time === 'night'

  // Stable: memoize valid ships to prevent re-renders
  const validShips = useMemo(() =>
    ships.filter(s => validateCoords(s.lat, s.lng).valid),
    [ships]
  )

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={isNight ? 0.2 : 0.8} color={isNight ? "#4466ff" : "#ffffff"} />
      
      {/* Primary Light (Sun) */}
      <directionalLight 
        position={isNight ? [-10, -2, -6] : [10, 5, 8]} 
        intensity={isNight ? 0.6 : 3.5} 
        color={isNight ? "#99bbff" : "#ffffff"} 
      />

      {/* Backlight / Rim Light for Silhouette */}
      <pointLight position={[-15, 0, -10]} intensity={2} color="#3b82f6" />
      
      {/* Soft fill light */}
      <directionalLight position={[-10, 0, 10]} intensity={0.5} color="#ffffff" />

      {/* Replacing subtle stars with the massive skyMap sphere placed in EarthMesh */}

        <Suspense fallback={<EarthFallback globeRef={globeRef} />}>
          <EarthMesh globeRef={globeRef} />
          
          {/* Ship markers — NOW children of globe group, so they rotate WITH it */}
          {validShips.map(ship => (
            <ShipMarker key={ship.id} ship={ship} onSelect={handleSelect} environment={environment} />
          ))}
        </Suspense>

        {/* Restricted Zone Outlines on Sphere */}
        <ZoneOutlines />

      <OrbitControls
        ref={controlsRef}
        makeDefault // Ensure it syncs optimally with the canvas
        enablePan={false}
        enableZoom={true}
        minDistance={1.15}
        maxDistance={4.5}
        autoRotate={false}
        autoRotateSpeed={0} 
        minPolarAngle={Math.PI / 4} // Prevent looking directly at poles for stability
        maxPolarAngle={Math.PI - Math.PI / 4}
        enableDamping={true}
        dampingFactor={0.06} // Smooth manual movement
        rotateSpeed={0.5} 
        zoomSpeed={0.6} 
        onChange={(e) => {
          if (!controlsRef.current) return
          const dist = controlsRef.current.object.position.length()
          
          // If zoomed in close enough, switch to 2D Map (ONLY if currently visible to prevent loops)
          if (visible && dist < 1.35 && onViewChange) {
            const pos = controlsRef.current.object.position.clone()
            
            // CRITICAL: Account for Globe Rotation
            if (globeRef.current) {
              // Apply Inverse Rotation of the globe to the camera position to get LOCAL coordinates
              pos.applyQuaternion(globeRef.current.quaternion.clone().invert())
            }

            const r = pos.length()
            const phi = Math.acos(pos.y / r)
            const theta = Math.atan2(pos.z, -pos.x)
            
            const lat = 90 - (phi * 180 / Math.PI)
            let lng = (theta * 180 / Math.PI) - 180
            
            // Normalize lng to [-180, 180]
            while (lng < -180) lng += 360
            while (lng > 180) lng -= 360
            
            onViewChange({ center: [lat, lng], zoom: 10 })
          }
        }}
      />
    </>
  )
}

/* ── Legend ── */
function Legend({ ships }) {
  const violations = ships.filter(s => s.isViolation).length
  const style = {
    position: 'absolute', top: 12, left: 12, zIndex: 10,
    background: 'rgba(4,10,24,0.7)', padding: '10px 14px',
    borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)',
    fontFamily: 'var(--font-mono)', minWidth: '170px'
  }
  return (
    <div style={style}>
      <div style={{ color: '#00d4ff', fontSize: '10px', fontWeight: 900, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px' }}>
         LIVE GLOBE · SHIP POSITIONS
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff0000', fontSize: '9px', fontWeight: 900, marginBottom: '10px', letterSpacing: '0.5px' }}>
        <span>ZONE VIOLATIONS</span>
        <span>{violations}</span>
      </div>
      
      {[
        { label: 'HIGH', color: '#ff0000', count: ships.filter(s => s.risk === 'HIGH').length },
        { label: 'MEDIUM', color: '#ffb830', count: ships.filter(s => s.risk === 'MEDIUM').length },
        { label: 'LOW', color: '#00e676', count: ships.filter(s => s.risk === 'LOW').length }
      ].map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '9px' }}>
          <span style={{ color: r.color, fontWeight: 700 }}>● {r.label}</span>
          <span style={{ color: '#fff', opacity: 0.6 }}>{r.count}</span>
        </div>
      ))}

      <div style={{ marginTop: '12px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '8px', color: '#7a95b8', lineHeight: 1.4 }}>
        DRAG TO ROTATE · SCROLL TO ZOOM<br/>CLICK MARKER FOR DETAILS
      </div>
    </div>
  )
}

export default function Globe3D({ ships, onSelectShip, environment, onViewChange, viewState, visible }) {
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
          <GlobeScene 
            ships={ships} 
            onSelectShip={onSelectShip} 
            environment={environment} 
            onViewChange={onViewChange}
            viewState={viewState}
            visible={visible}
          />
        </Suspense>
      </Canvas>
      <Legend ships={ships} />
      {/* Bottom Status Bar */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        background: 'rgba(0,10,20,0.8)', padding: '6px 14px', borderRadius: '4px',
        border: '1px solid rgba(0,212,255,0.3)', fontFamily: 'var(--font-mono)',
        fontSize: '10px', color: '#00d4ff', letterSpacing: '1px'
      }}>
        ● THREE.JS 3D GLOBE · WEBGL ACCELERATED
      </div>
    </div>
  )
}
