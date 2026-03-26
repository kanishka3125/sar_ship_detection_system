import React, { Suspense, Component } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, Stage, Center, OrbitControls } from '@react-three/drei'

/* ═══════════════════════════════════════════════════════════════
   ZENITH — Dynamic GLB Ship Viewer
   Uses @react-three/drei's Stage and Center for professional
   lighting, automatic scaling, and centering.
   ═══════════════════════════════════════════════════════════════ */

const MODEL_PATHS = {
  cargo: '/models/cargo.glb',
  naval: '/models/cargo.glb',
  dark: '/models/cargo.glb',
}

useGLTF.preload(MODEL_PATHS.cargo)

/* ── Error boundary to catch useGLTF 404s gracefully ── */
class ModelErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? null  // or swap with a placeholder mesh
      : this.props.children
  }
}

/**
 * ShipViewer Component
 * @param {string} type - 'cargo', 'naval', or 'dark'
 * @param {object} ship - full ship data object
 */
export default function ShipViewer({ type = 'cargo', ship = null }) {
  const modelPath = MODEL_PATHS[type] || MODEL_PATHS.cargo

  return (
    <Canvas camera={{ position: [0, 2, 6], fov: 45 }}>
      <Suspense fallback={null}>
        <Stage
          environment="city"
          intensity={0.5}
          shadows={{ type: 'contact', opacity: 0.7, blur: 2 }}
          adjustCamera={false}
        >
          <Center top={true}>
            <ModelErrorBoundary>
              <Model path={modelPath} />
            </ModelErrorBoundary>
          </Center>
        </Stage>
        <OrbitControls
          makeDefault
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.5}
          minDistance={2}
          maxDistance={10}
        />
      </Suspense>
    </Canvas>
  )
}

/**
 * Model Loader — clones scene to allow safe multi-instance rendering
 */
function Model({ path }) {
  const { scene } = useGLTF(path)
  return <primitive object={scene.clone()} />
}