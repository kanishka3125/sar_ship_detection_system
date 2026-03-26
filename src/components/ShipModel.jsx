import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'

// Only cargo.glb is available — naval and dark will also use it
// When naval.glb / dark.glb are added to /public/models/, update this map
const MODEL_MAP = {
  cargo: '/models/cargo.glb',
  naval: '/models/cargo.glb',
  dark:  '/models/cargo.glb',
}

export default function ShipModel({ type = 'cargo' }) {
  const modelPath = useMemo(
    () => MODEL_MAP[type] ?? MODEL_MAP.cargo,
    [type]
  )
  const { scene } = useGLTF(modelPath)
  const cloned    = useMemo(() => scene.clone(true), [scene])

  return <primitive object={cloned} scale={0.3} />
}

// Preload only the file that actually exists
useGLTF.preload('/models/cargo.glb')