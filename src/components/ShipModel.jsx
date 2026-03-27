import React, { Suspense, Component, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, Center, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════
   ZENITH — Dynamic GLB Ship Viewer (with Procedural Fallback)
   ═══════════════════════════════════════════════════════════════ */

const MODEL_PATHS = {
  cargo: '/models/cargo.glb',
  naval: '/models/cargo.glb',
  dark:  '/models/cargo.glb',
}

useGLTF.preload(MODEL_PATHS.cargo)

/* ── Error boundary to catch useGLTF errors/Empty files ── */
class ModelErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error("3D Model Error:", err); this.setState({ failed: true }) }
  render() {
    return this.state.failed
      ? <ProceduralShip /> 
      : this.props.children
  }
}

/**
 * Main ShipViewer Component
 */
export default function ShipViewer({ type = 'cargo', ship = null }) {
  const modelPath = MODEL_PATHS[type] || MODEL_PATHS.cargo

  return (
    <Canvas 
      shadows 
      camera={{ position: [0, 1.5, 4.5], fov: 40 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: 'transparent' }}
    >
      <Suspense fallback={<LoadingIndicator />}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#3b82f6" />
        <Environment preset="sunset" />

        <Center top>
          <ModelErrorBoundary>
            <FloatingShip>
              <Model path={modelPath} />
            </FloatingShip>
          </ModelErrorBoundary>
        </Center>

        <OrbitControls makeDefault enableDamping dampingFactor={0.05} enablePan={false} autoRotate autoRotateSpeed={0.8} minDistance={2.5} maxDistance={8} />
      </Suspense>
    </Canvas>
  )
}

function FloatingShip({ children }) {
  const groupRef = useRef()
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.08
      groupRef.current.rotation.z = Math.sin(t * 0.4) * 0.03
      groupRef.current.rotation.x = Math.cos(t * 0.5) * 0.02
    }
  })
  return <group ref={groupRef}>{children}</group>
}

function Model({ path }) {
  const { scene } = useGLTF(path)
  // If scene is empty or invalid, throw to trigger fallback
  if (!scene || scene.children.length === 0) throw new Error("Empty Model")
  return <primitive object={scene.clone()} scale={0.4} />
}

/**
 * Simple Loading Indicator for Suspense
 */
function LoadingIndicator() {
  const meshRef = useRef()
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.05
      meshRef.current.rotation.y += 0.05
    }
  })
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#3b82f6" wireframe />
    </mesh>
  )
}

/**
 * Optimized Procedural Ship Mesh
 */
function ProceduralShip() {
  return (
    <group scale={1.2}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 0.4, 4]} />
        <meshStandardMaterial color="#2d3748" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 2.2]}>
        <coneGeometry args={[0.5, 0.4, 4]} />
        <meshStandardMaterial color="#2d3748" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.45, -1]}>
        <boxGeometry args={[0.8, 0.5, 0.8]} />
        <meshStandardMaterial color="#1a202c" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.55, -0.6]}>
        <boxGeometry args={[0.6, 0.1, 0.05]} />
        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0, 0.25, 0.4]}>
        <boxGeometry args={[0.7, 0.2, 2]} />
        <meshStandardMaterial color="#4a5568" />
      </mesh>
    </group>
  )
}