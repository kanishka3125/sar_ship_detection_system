import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html, useTexture } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'
import { validateCoords } from '../utils/timeUtils'
import { RESTRICTED_ZONES } from '../data/zones'

const RISK_COLORS = { HIGH: 'var(--danger)', MEDIUM: 'var(--warning)', LOW: 'var(--text-dim)' }

/* Convert lat/lng → stable 3D Vector3 on unit sphere */
function latLngToVec3(lat, lng, radius = 1.025) {
  // 1. Longitude Normalization: ((lng + 180) % 360) - 180
  const normalizedLng = ((lng + 180) % 360) - 180
  
  // 2. Degrees to Radians
  const latRad = lat * (Math.PI / 180)
  const lngRad = normalizedLng * (Math.PI / 180)

  // 3. User Requested Projection (x=cos*sin, y=sin, z=cos*cos)
  const x = radius * Math.cos(latRad) * Math.sin(lngRad)
  const y = radius * Math.sin(latRad)
  const z = radius * Math.cos(latRad) * Math.cos(lngRad)

  return new THREE.Vector3(x, y, z)
}

/* ── Realistic Earth with Satellite Textures, Clouds & City Lights ── */
function EarthMesh() {
  const [dayMap, skyMap] = useTexture([
    '/models/earth_color_vibrant.jpg',
    '/models/night_sky.png'
  ])

  return (
    <group rotation={[0, -Math.PI / 2, 0]}>
      {/* 1. Main Earth Sphere — MeshBasicMaterial = full brightness, no shadow */}
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial map={dayMap} />
      </mesh>

      {/* 2. Milky Way Sky Background */}
      <mesh scale={[150, 150, 150]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial map={skyMap} side={THREE.BackSide} />
      </mesh>

      {/* 3. Atmosphere Glow */}
      <mesh>
        <sphereGeometry args={[1.02, 64, 64]} />
        <meshBasicMaterial color="#4da6ff" transparent opacity={0.18} side={THREE.FrontSide} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 4. Outer halo for depth */}
      <mesh>
        <sphereGeometry args={[1.06, 64, 64]} />
        <meshBasicMaterial color="#1a6bcc" transparent opacity={0.07} side={THREE.FrontSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/* ── Fallback plain globe ── */
function EarthFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color="#0d3060" />
    </mesh>
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
  const isHigh   = ship.risk === 'HIGH' || isViolation
  const size     = isViolation ? 0.012 : isHigh ? 0.009 : 0.006 // Smaller, more professional

  // 1:1 Mapping: Pre-calculate stable position once (No drift)
  const pos = useMemo(() => latLngToVec3(ship.lat, ship.lng), [ship.lat, ship.lng])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current) {
      const speed = isViolation ? 4.5 : isHigh ? 2.5 : 1.5
      const amp   = isViolation ? 0.3 : isHigh ? 0.2 : 0.08
      const sc = 1 + Math.sin(t * speed) * amp
      ref.current.scale.setScalar(sc)
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

/* ── 3D Intelligence Cluster Marker ── */
function ClusterMarker({ cluster, isExpanded, onToggleExpanded }) {
  const ref = useRef()
  const ringRef = useRef()
  const [hovered, setHovered] = useState(false)

  // 1:1 Mapping: Pre-calculate stable position once
  const pos = useMemo(() => latLngToVec3(cluster.center[0], cluster.center[1]), [cluster.center])

  // Scale base radius by vessel count
  const baseSize = 0.008 + (cluster.vessel_count * 0.002)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current) {
      ref.current.scale.setScalar(1 + Math.sin(t * 2) * 0.1) // Gentle pulse
    }
    if (ringRef.current) {
      const phase = (t * 1.5) % 1
      ringRef.current.scale.setScalar(1 + phase * (isExpanded ? 3.5 : 2.5))
      ringRef.current.material.opacity = (isExpanded ? 0.6 : 0.4) * (1 - phase)
    }
  })

  return (
    <group position={pos} onClick={(e) => { e.stopPropagation(); onToggleExpanded() }}>
      {/* Base Cluster Core */}
      <mesh ref={ref} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[baseSize, 16, 16]} />
        <meshStandardMaterial color="orange" emissive="orange" emissiveIntensity={hovered ? 2.5 : 1.2} toneMapped={false} />
      </mesh>

      {/* Pulsing Radar Ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[baseSize * 1.5, baseSize * 2.5, 32]} />
        <meshBasicMaterial color="orange" transparent opacity={0.4} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Cluster Label Overlay */}
      <Html distanceFactor={4} style={{ pointerEvents: 'none', transform: 'translate(-50%, -150%)' }}>
        <div style={{
          background: 'rgba(255, 165, 0, 0.9)', 
          color: '#000', 
          fontWeight: 800, 
          borderRadius: '50%',
          width: '24px', height: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px',
          boxShadow: '0 4px 12px rgba(255,165,0,0.4)'
        }}>
          {cluster.vessel_count}
        </div>
      </Html>

      {/* Drill-Down Ships if Expanded */}
      {isExpanded && cluster.detections && cluster.detections.map((det, idx) => {
        const detPos = latLngToVec3(det[0], det[1], 1.002) // Slightly above surface, local to cluster
        // To render drilldowns properly relative to the cluster's local position, 
        // we subtract the cluster center pos so they appear around the group origin.
        const localPos = new THREE.Vector3().subVectors(detPos, pos)
        
        return (
          <meshey key={idx} position={localPos}>
            <sphereGeometry args={[0.003, 8, 8]} />
            <meshBasicMaterial color="white" toneMapped={false} />
          </meshey>
        )
      })}
    </group>
  )
}

/* ── Globe Scene ── */
function GlobeScene({ ships, clusters = [], onSelectShip, environment, onViewChange, viewState, visible }) {
  const globeRef = useRef()
  const { camera } = useThree()
  const controlsRef = useRef()
  
  const [diveState, setDiveState] = useState(null)
  const [expandedClusterId, setExpandedClusterId] = useState(null)

  // Handle ship selection with a cinematic "Dive" animation
  const handleSelect = useCallback((ship) => {
    if (controlsRef.current) controlsRef.current.enabled = false
    
    // Target slightly above the surface for an immersive Google Earth approach view
    const endVec = latLngToVec3(ship.lat, ship.lng, 1.25)
    
    setDiveState({
      startPos: camera.position.clone(),
      endPos: endVec,
      startTime: performance.now(),
      duration: 1500, // 1.5s cinematic flight
      ship: ship
    })

    onSelectShip(ship)
  }, [onSelectShip, camera])

  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

  useFrame((state) => {
    if (diveState) {
      const { startPos, endPos, startTime, duration, ship } = diveState
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeInOutCubic(progress)
      
      // Interpolate along the arc for a smooth flight path
      camera.position.lerpVectors(startPos, endPos, eased)
      camera.lookAt(0, 0, 0) // Always keep Earth center perfectly focused

      if (progress === 1) {
        // Animation finished: trigger 2D map transition
        // The App.jsx layer transitions will handle the cross-dissolve opacity
        onViewChange({ center: [ship.lat, ship.lng], zoom: 8 })
        if (controlsRef.current) controlsRef.current.enabled = true
        setDiveState(null)
      }
    }
  })

  const isNight = environment?.time === 'night'

  // Stable: memoize valid ships to prevent re-renders
  const validShips = useMemo(() =>
    ships.filter(s => validateCoords(s.lat, s.lng).valid),
    [ships]
  )

  return (
    <>
      <color attach="background" args={['#010206']} />
      <ambientLight intensity={isNight ? 0.3 : 2.2} color={isNight ? "#112244" : "#ffffff"} />
      
      {/* Primary Sun Light - Pure White for realistic rendering */}
      <directionalLight 
        position={isNight ? [-10, -5, -10] : [15, 10, 12]} 
        intensity={isNight ? 0.3 : 9.0} 
        color="#ffffff" 
        castShadow
      />

      {/* Earth Rim Light (Subtle atmospheric backlight) */}
      <pointLight position={[-15, 2, -12]} intensity={isNight ? 1 : 4} color="#4da6ff" />
      
      {/* Soft indirect bounce */}
      <directionalLight position={[-8, 4, 15]} intensity={0.5} color="#ffffff" />

      {/* Replacing subtle stars with the massive skyMap sphere placed in EarthMesh */}

        <Suspense fallback={<EarthFallback />}>
          <group ref={globeRef}>
            <EarthMesh />
            
            {/* Ship markers — children of rotated globe group for 1:1 parity */}
            {validShips.map(ship => (
              <ShipMarker key={ship.id} ship={ship} onSelect={handleSelect} environment={environment} />
            ))}

            {/* restricted Zone Outlines on Sphere */}
            <ZoneOutlines />

            {/* High-Level Intelligence Clusters */}
            {clusters.map(cluster => (
              <ClusterMarker 
                key={cluster.id} 
                cluster={cluster} 
                isExpanded={expandedClusterId === cluster.id}
                onToggleExpanded={() => setExpandedClusterId(prev => prev === cluster.id ? null : cluster.id)}
              />
            ))}
          </group>
        </Suspense>

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



export default function Globe3D({ ships, clusters = [], onSelectShip, environment, onViewChange, viewState, visible }) {
  return (
    <div style={{ width:'100%', height:'100%', position:'relative' }}>
      <Canvas
        camera={{ position:[0, 1.2, 3.2], fov: 35 }} // Narrower FOV for cinematic telephoto Google Earth feel
        gl={{ 
          antialias: true, 
          alpha: false, 
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.9 // Bright, vivid globe
        }}
      >
        <fog attach="fog" args={['#040f1e', 1.5, 5]} /> {/* Cinematic depth illusion (scaled for R3F radius=1) */}
        <Suspense fallback={null}>
          <GlobeScene 
            ships={ships} 
            clusters={clusters}
            onSelectShip={onSelectShip} 
            environment={environment} 
            onViewChange={onViewChange}
            viewState={viewState}
            visible={visible}
          />
        </Suspense>
      </Canvas>

    </div>
  )
}
