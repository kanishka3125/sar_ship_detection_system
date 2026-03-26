import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════
   ZENITH — Immersive Procedural 3D Ship Viewer
   Premium procedural ship models with animated ocean, PBR materials,
   hover glow, and per-type design variants.
   ═══════════════════════════════════════════════════════════════ */

const SHIP_THEMES = {
  cargo: {
    hull: '#5a6a7e', hullDark: '#3a4a5e', deck: '#8899aa', bridge: '#b0bec5',
    accent: '#2196F3', container: '#e74c3c', containerAlt: '#f39c12',
    window: '#80d8ff', funnel: '#455a64', railing: '#90a4ae',
    water: '#0a2040', waterDeep: '#061428',
  },
  naval: {
    hull: '#37474f', hullDark: '#263238', deck: '#546e7a', bridge: '#78909c',
    accent: '#4caf50', container: '#37474f', containerAlt: '#455a64',
    window: '#69f0ae', funnel: '#37474f', railing: '#607d8b',
    water: '#0a2040', waterDeep: '#061428',
  },
  dark: {
    hull: '#1a1a2e', hullDark: '#0f0f1e', deck: '#16213e', bridge: '#1a1a3e',
    accent: '#e94560', container: '#16213e', containerAlt: '#0f3460',
    window: '#ff4081', funnel: '#1a1a2e', railing: '#2a2a4e',
    water: '#080818', waterDeep: '#040410',
  },
}

/* ── Animated Ocean Surface ──────────────────────────────────── */
function AnimatedOcean({ colors }) {
  const meshRef = useRef()
  const geoRef = useRef()

  // Create a grid of vertices that will be animated
  const { positions, indices } = useMemo(() => {
    const size = 12, segments = 80
    const pos = []
    const idx = []
    const step = size / segments

    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        pos.push(
          (j * step) - size / 2,
          0,
          (i * step) - size / 2
        )
      }
    }

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * (segments + 1) + j
        const b = a + 1
        const c = a + (segments + 1)
        const d = c + 1
        idx.push(a, b, c, b, d, c)
      }
    }

    return {
      positions: new Float32Array(pos),
      indices: new Uint32Array(idx),
    }
  }, [])

  useFrame(({ clock }) => {
    if (!geoRef.current) return
    const t = clock.elapsedTime
    const posAttr = geoRef.current.attributes.position
    const arr = posAttr.array
    const segments = 80
    const size = 12
    const step = size / segments

    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const idx = (i * (segments + 1) + j) * 3
        const x = (j * step) - size / 2
        const z = (i * step) - size / 2
        // Multi-octave waves
        const y =
          Math.sin(x * 0.8 + t * 0.6) * 0.03 +
          Math.sin(z * 1.2 + t * 0.8) * 0.02 +
          Math.sin((x + z) * 0.5 + t * 0.4) * 0.015 +
          Math.cos(x * 2.0 + z * 1.5 + t * 1.2) * 0.008
        arr[idx + 1] = y
      }
    }
    posAttr.needsUpdate = true
    geoRef.current.computeVertexNormals()
  })

  return (
    <mesh ref={meshRef} position={[0, -0.18, 0]} receiveShadow>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
        />
        <bufferAttribute
          attach="index"
          args={[indices, 1]}
          count={indices.length}
        />
      </bufferGeometry>
      <meshStandardMaterial
        color={colors.water}
        roughness={0.15}
        metalness={0.85}
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        envMapIntensity={1.5}
      />
    </mesh>
  )
}

/* ── Ship Hull (Detailed extruded shape) ─────────────────────── */
function ShipHull({ colors }) {
  const hullGeo = useMemo(() => {
    const shape = new THREE.Shape()
    // Smooth hull profile with curves
    shape.moveTo(0, 3.0)        // bow tip
    shape.quadraticCurveTo(0.3, 2.5, 0.55, 2.0)
    shape.lineTo(0.75, 1.0)
    shape.lineTo(0.85, 0)
    shape.lineTo(0.85, -1.5)
    shape.quadraticCurveTo(0.85, -2.3, 0.7, -2.8)  // stern curve
    shape.lineTo(-0.7, -2.8)
    shape.quadraticCurveTo(-0.85, -2.3, -0.85, -1.5)
    shape.lineTo(-0.85, 0)
    shape.lineTo(-0.75, 1.0)
    shape.quadraticCurveTo(-0.3, 2.5, 0, 3.0)

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.65,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 4,
    })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, -0.05, 0)
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <group>
      <mesh geometry={hullGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={colors.hull}
          roughness={0.35}
          metalness={0.65}
          envMapIntensity={0.8}
        />
      </mesh>
      {/* Waterline stripe */}
      <mesh position={[0, 0.02, 0.1]} castShadow>
        <boxGeometry args={[1.72, 0.04, 5.4]} />
        <meshStandardMaterial color={colors.hullDark} roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  )
}

/* ── Ship Deck ───────────────────────────────────────────────── */
function ShipDeck({ colors }) {
  return (
    <group>
      <mesh position={[0, 0.35, -0.1]} castShadow>
        <boxGeometry args={[1.5, 0.04, 5.0]} />
        <meshStandardMaterial color={colors.deck} roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Deck detail lines */}
      {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 0.375, 0.2]}>
          <boxGeometry args={[0.015, 0.005, 3.8]} />
          <meshStandardMaterial color={colors.railing} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Bridge (Multi-level superstructure) ─────────────────────── */
function ShipBridge({ colors }) {
  return (
    <group position={[0, 0.37, -1.5]}>
      {/* Level 1 — base */}
      <mesh castShadow>
        <boxGeometry args={[1.1, 0.45, 0.9]} />
        <meshStandardMaterial color={colors.bridge} roughness={0.3} metalness={0.55} />
      </mesh>
      {/* Level 2 — wheelhouse */}
      <mesh position={[0, 0.38, 0.05]} castShadow>
        <boxGeometry args={[0.9, 0.35, 0.7]} />
        <meshStandardMaterial color={colors.bridge} roughness={0.3} metalness={0.55} />
      </mesh>
      {/* Front windows (panoramic) */}
      {[-0.28, -0.1, 0.1, 0.28].map((x, i) => (
        <mesh key={`fw${i}`} position={[x, 0.4, 0.36]}>
          <boxGeometry args={[0.14, 0.15, 0.02]} />
          <meshStandardMaterial
            color={colors.window} emissive={colors.window}
            emissiveIntensity={0.6} roughness={0.05} metalness={0.95}
            transparent opacity={0.9}
          />
        </mesh>
      ))}
      {/* Side windows */}
      {[-1, 1].map(side => (
        [0, 0.2].map((z, i) => (
          <mesh key={`sw${side}${i}`} position={[side * 0.46, 0.4, z - 0.1]}>
            <boxGeometry args={[0.02, 0.12, 0.1]} />
            <meshStandardMaterial
              color={colors.window} emissive={colors.window}
              emissiveIntensity={0.4} roughness={0.05} metalness={0.95}
            />
          </mesh>
        ))
      ))}
      {/* Antenna mast */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.02, 0.55, 8]} />
        <meshStandardMaterial color={colors.railing} roughness={0.2} metalness={0.85} />
      </mesh>
      {/* Radar dish (spinning) */}
      <RadarDish colors={colors} />
      {/* Navigation lights */}
      <mesh position={[0.47, 0.2, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <mesh position={[-0.47, 0.2, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ── Spinning Radar Dish ─────────────────────────────────────── */
function RadarDish({ colors }) {
  const ref = useRef()
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 1.5 })
  return (
    <group ref={ref} position={[0, 1.0, 0]}>
      <mesh>
        <boxGeometry args={[0.4, 0.015, 0.06]} />
        <meshStandardMaterial color={colors.accent} roughness={0.2} metalness={0.8} />
      </mesh>
    </group>
  )
}

/* ── Cargo Containers (stacked, colorful) ────────────────────── */
function Containers({ colors, type }) {
  if (type !== 'cargo') return null
  const containerColors = [colors.container, colors.containerAlt, colors.accent, '#2e7d32', '#1565c0', '#ad1457']

  const containers = useMemo(() => {
    const result = []
    // Row 1: 3 wide, 2 deep
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        for (let stack = 0; stack < (row === 0 ? 2 : 1); stack++) {
          result.push({
            pos: [(col - 1) * 0.4, 0.48 + stack * 0.24, 0.5 + row * 0.75],
            color: containerColors[(row * 3 + col + stack) % containerColors.length],
          })
        }
      }
    }
    return result
  }, [])

  return (
    <group>
      {containers.map((c, i) => (
        <mesh key={i} position={c.pos} castShadow>
          <boxGeometry args={[0.34, 0.22, 0.65]} />
          <meshStandardMaterial color={c.color} roughness={0.65} metalness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Naval Equipment (turrets, antennas) ─────────────────────── */
function NavalEquipment({ colors, type }) {
  if (type !== 'naval') return null
  return (
    <group>
      {/* Forward turret */}
      <group position={[0, 0.5, 1.2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.22, 0.15, 16]} />
          <meshStandardMaterial color={colors.hull} roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.12, 0.15]} rotation={[Math.PI / 12, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.45, 8]} />
          <meshStandardMaterial color={colors.hull} roughness={0.25} metalness={0.8} />
        </mesh>
      </group>
      {/* Aft turret */}
      <group position={[0, 0.5, -0.5]} rotation={[0, Math.PI, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.15, 0.18, 0.12, 16]} />
          <meshStandardMaterial color={colors.hull} roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.1, 0.12]} rotation={[Math.PI / 12, 0, 0]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.35, 8]} />
          <meshStandardMaterial color={colors.hull} roughness={0.25} metalness={0.8} />
        </mesh>
      </group>
      {/* Vertical launch cells */}
      <mesh position={[0, 0.45, 0.3]} castShadow>
        <boxGeometry args={[0.5, 0.12, 0.5]} />
        <meshStandardMaterial color={colors.hullDark} roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  )
}

/* ── Funnel / Exhaust Stack ──────────────────────────────────── */
function Funnel({ colors, type }) {
  return (
    <group position={[0, 0.37, type === 'cargo' ? -0.6 : -0.8]}>
      <mesh castShadow>
        <boxGeometry args={[0.35, 0.55, 0.3]} />
        <meshStandardMaterial color={colors.funnel} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Funnel top */}
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.38, 0.06, 0.33]} />
        <meshStandardMaterial color={colors.hullDark} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Funnel stripe */}
      <mesh position={[0, 0.1, 0.155]}>
        <boxGeometry args={[0.32, 0.12, 0.005]} />
        <meshStandardMaterial color={colors.accent} roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  )
}

/* ── Deck Railings ───────────────────────────────────────────── */
function Railings({ colors }) {
  const posts = useMemo(() => {
    const result = []
    // Port & starboard railings
    for (let side of [-1, 1]) {
      for (let z = -2.0; z <= 2.2; z += 0.4) {
        result.push([side * 0.72, 0.44, z])
      }
    }
    return result
  }, [])

  return (
    <group>
      {posts.map((p, i) => (
        <mesh key={i} position={p}>
          <cylinderGeometry args={[0.008, 0.008, 0.12, 4]} />
          <meshStandardMaterial color={colors.railing} roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      {/* Horizontal rail lines */}
      {[-1, 1].map(side => (
        <mesh key={`rail${side}`} position={[side * 0.72, 0.49, 0.1]}>
          <boxGeometry args={[0.005, 0.005, 4.4]} />
          <meshStandardMaterial color={colors.railing} roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Bow Markings (ship name) ────────────────────────────────── */
function BowDetails({ colors }) {
  return (
    <group>
      {/* Anchor */}
      <mesh position={[0.4, 0.15, 2.2]}>
        <torusGeometry args={[0.04, 0.01, 6, 12]} />
        <meshStandardMaterial color={colors.railing} roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Bow bulb */}
      <mesh position={[0, -0.1, 2.8]} castShadow>
        <sphereGeometry args={[0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={colors.hullDark} roughness={0.35} metalness={0.65} />
      </mesh>
    </group>
  )
}

/* ── Risk-based Glow Ring (bottom) ───────────────────────────── */
function RiskGlow({ risk }) {
  const color = risk === 'HIGH' ? '#ff2d55' : risk === 'MEDIUM' ? '#ffb830' : '#00e676'
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.material.opacity = 0.15 + Math.sin(clock.elapsedTime * 2) * 0.08
  })
  return (
    <mesh ref={ref} position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.2, 1.6, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Main ShipModel Export — Accepts: type, risk, ship
   ═══════════════════════════════════════════════════════════════ */
export default function ShipModel({ type = 'cargo', risk = 'LOW', ship = null }) {
  const colors = SHIP_THEMES[type] || SHIP_THEMES.cargo
  const groupRef = useRef()
  const [hovered, setHovered] = useState(false)

  // Subtle idle sway animation
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.rotation.z = Math.sin(t * 0.4) * 0.015 // gentle roll
    groupRef.current.rotation.x = Math.sin(t * 0.3 + 1) * 0.008 // gentle pitch
  })

  return (
    <group
      ref={groupRef}
      scale={0.55}
      rotation={[0, Math.PI / 5, 0]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <ShipHull colors={colors} />
      <ShipDeck colors={colors} />
      <ShipBridge colors={colors} />
      <Containers colors={colors} type={type} />
      <NavalEquipment colors={colors} type={type} />
      <Funnel colors={colors} type={type} />
      <Railings colors={colors} />
      <BowDetails colors={colors} />
      <RiskGlow risk={risk} />
      <AnimatedOcean colors={colors} />

      {/* Hover highlight — emissive edge glow */}
      {hovered && (
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[2.0, 0.8, 6.2]} />
          <meshBasicMaterial
            color="#00d4ff"
            transparent
            opacity={0.04}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            wireframe
          />
        </mesh>
      )}
    </group>
  )
}