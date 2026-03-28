import React, { useEffect, useRef } from 'react'

const regions = ['Mumbai', 'Kochi', 'Visakhapatnam', 'Chennai']

export default function SARViewer({ files, backendData }) {
  if (!files || files.length === 0) return null

  const canvasRefs = useRef([])

  useEffect(() => {
    if (!backendData || !backendData.vessel_reports) return

    canvasRefs.current.forEach((canvas, index) => {
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.src = URL.createObjectURL(files[index])

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height

        // Draw image
        canvas.width = 180
        canvas.height = 120
        
        ctx.drawImage(img, 0, 0, 180, 120)
        ctx.imageSmoothingEnabled = false

        // Filter detections for this image
        const detections = [backendData.vessel_reports[index]]
        if (!detections[0]) return
        console.log("Detections in SARViewer:", detections)

        // Draw bounding boxes
        detections.forEach(det => {
            const box = det.bbox
            if (!box) return
            const scaleX = canvas.width / img.width
            const scaleY = canvas.height / img.height

            const x = (box.x_center - box.width / 2) * 180
            const y = (box.y_center - box.height / 2) * 120
            const w = box.width * 180
            const h = box.height * 120

            ctx.strokeStyle = '#00FFAA'
            ctx.lineWidth = 2
            ctx.strokeRect(x, y, w, h)

            ctx.fillStyle = '#00FFAA'
            ctx.font = '12px monospace'
            ctx.fillText(
            `Ship ${(det.confidence * 100).toFixed(1)}%`,
            x,
            y - 3
          )
        })
      }
    })
  }, [files, backendData])

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: 20,
      zIndex: 1000,
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 180px)',
      gap: '10px',
      background: 'rgba(0,0,0,0.6)',
      padding: '10px',
      borderRadius: '10px',
      backdropFilter: 'blur(6px)',
      border: '1px solid var(--border-color)'
    }}>
      {files.map((file, index) => (
        <div key={index} style={{ position: 'relative' }}>

          {/* Region Label */}
          <div style={{
            position: 'absolute',
            top: 4,
            left: 4,
            background: 'rgba(0,0,0,0.7)',
            padding: '2px 6px',
            fontSize: '10px',
            borderRadius: '4px',
            color: 'white',
            zIndex: 2
          }}>
            {regions[index] || `Region ${index+1}`}
          </div>

          {/* Canvas */}
          <canvas
            ref={el => canvasRefs.current[index] = el}
            style={{
              width: '180px',
              height: '120px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)'
            }}
          />
        </div>
      ))}
    </div>
  )
}