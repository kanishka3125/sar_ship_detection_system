import { useState } from 'react'

const TOPICS = [
  {
    id: 'dark-vessel',
    icon: '🚫',
    label: 'DARK VESSEL',
    color: '#ff2d55',
    headline: 'Ships That Go Dark',
    summary: 'A dark vessel is any ship that deliberately turns off its Automatic Identification System (AIS) transponder to avoid detection — a major red flag in maritime surveillance.',
    sections: [
      {
        title: 'What is AIS?',
        icon: '📡',
        body: 'AIS (Automatic Identification System) is a mandatory tracking system on large ships. It broadcasts position, speed, heading, and identity data every few seconds so nearby vessels and coast guards can track them.',
      },
      {
        title: 'Why Go Dark?',
        icon: '🌑',
        body: 'Vessels disable AIS to evade sanctions, conduct illegal fishing in protected zones, smuggle cargo, engage in ship-to-ship transfers of prohibited goods, or operate near military installations without authorization.',
      },
      {
        title: 'How SAR Detects Them',
        icon: '🛰️',
        body: 'Synthetic Aperture Radar (SAR) satellites like Sentinel-1 can penetrate clouds and darkness. They detect the radar backscatter of ship hulls even with no AIS signal — revealing dark vessels that believe they are invisible.',
      },
      {
        title: 'Risk Indicators',
        icon: '⚠️',
        body: 'Key signals include: AIS gap > 6 hours, SAR detection with no matching AIS broadcast within 0.5 nm, presence in exclusion zones, and speed/heading inconsistencies when AIS resumes.',
      },
    ],
    visual: {
      label: 'Dark Vessel Detection Pipeline',
      steps: ['SAR Satellite Pass', 'Ship Detection (YOLOv8)', 'AIS Cross-Reference', 'No AIS Match Found', 'DARK VESSEL Alert'],
      colors: ['#00d4ff', '#4488ff', '#ffb830', '#ff6b3d', '#ff2d55'],
    },
  },

  {
    id: 'ais-spoofing',
    icon: '📡',
    label: 'AIS SPOOFING',
    color: '#ffb830',
    headline: 'False Identity at Sea',
    summary: 'AIS spoofing occurs when a vessel transmits a false GPS position or identity via its AIS transponder — making it appear to be somewhere it is not.',
    sections: [
      {
        title: 'How Spoofing Works',
        icon: '🎭',
        body: 'A vessel transmits doctored AIS messages, altering its reported GPS coordinates, MMSI number, vessel name, or speed. Port authorities and coast guards see a fictional position on their screens.',
      },
      {
        title: 'Detection Method',
        icon: '🛰️',
        body: 'ZENITH fuses AIS data with SAR satellite imagery. If a vessel\'s AIS-reported position differs by more than 0.5–2 nm from its SAR-confirmed location, spoofing is flagged immediately.',
      },
      {
        title: 'Common Scenarios',
        icon: '📋',
        body: 'Spoofing enables: sanctions evasion (appearing in permitted ports while elsewhere), concealing ship-to-ship transfers of oil, avoid port-state control inspections, and transiting restricted military zones.',
      },
      {
        title: 'Global Scale',
        icon: '🌍',
        body: 'Since 2020, thousands of spoofing incidents have been documented globally — concentrated in Persian Gulf, Caspian Sea, and Chinese territorial waters. Advanced actors can spoof hundreds of vessels simultaneously.',
      },
    ],
    visual: {
      label: 'AIS Spoofing Detection',
      steps: ['AIS Reported Position', 'SAR True Position', 'Position Delta Computed', 'Delta > 0.5 nm?', 'AIS SPOOF Alert'],
      colors: ['#4488ff', '#00d4ff', '#ffb830', '#ff6b3d', '#ff2d55'],
    },
  },

  {
    id: 'sar-imaging',
    icon: '🛰️',
    label: 'SAR IMAGING',
    color: '#00d4ff',
    headline: 'Radar Eyes in the Sky',
    summary: 'Synthetic Aperture Radar (SAR) is the core sensing technology behind ZENITH. Unlike optical cameras, SAR works in all weather and at night — making it the gold standard for maritime surveillance.',
    sections: [
      {
        title: 'How SAR Works',
        icon: '📡',
        body: 'SAR satellites emit microwave pulses toward Earth and measure the returned echo. By combining echoes from many positions along the orbit, they synthesize a very long antenna — giving extremely high resolution radar images.',
      },
      {
        title: 'Why SAR for Ships',
        icon: '🚢',
        body: 'Ship hulls are excellent reflectors of radar waves. SAR can detect vessels as small as fishing boats even in dense cloud cover, monsoon rain, or complete darkness. Optical satellites cannot do this.',
      },
      {
        title: 'Sentinel-1 Satellite',
        icon: '🌐',
        body: 'ESA\'s Sentinel-1 constellation provides free SAR coverage of the global ocean every 6–12 days. ZENITH uses Sentinel-1 IW (Interferometric Wide) mode imagery at 10-meter resolution for ship detection.',
      },
      {
        title: 'YOLOv8 Detection',
        icon: '🤖',
        body: 'ZENITH applies a custom-trained YOLOv8 object detection model on SAR image tiles. The model identifies ship-like radar signatures with >90% confidence, then cross-references detections with AIS to flag anomalies.',
      },
    ],
    visual: {
      label: 'SAR Detection Pipeline',
      steps: ['Sentinel-1 SAR Pass', 'Image Preprocessing', 'YOLOv8 Inference', 'Ship Bounding Boxes', 'AIS Fusion & Alert'],
      colors: ['#00d4ff', '#4488ff', '#00e676', '#ffb830', '#ff2d55'],
    },
  },
]

function TopicPipeline({ visual }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '2px', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>
        {visual.label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
        {visual.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.3px',
              background: `${visual.colors[i]}18`, color: visual.colors[i],
              border: `1px solid ${visual.colors[i]}44`,
              boxShadow: `0 0 12px ${visual.colors[i]}22`,
              whiteSpace: 'nowrap',
            }}>
              {step}
            </div>
            {i < visual.steps.length - 1 && (
              <span style={{ color: 'var(--text-dim)', fontSize: '14px' }}>→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LearnSection({ onClose }) {
  const [active, setActive] = useState('dark-vessel')
  const topic = TOPICS.find(t => t.id === active)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8000,
      background: 'rgba(2,5,14,0.92)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease forwards',
    }}>
      <div style={{
        width: '900px', maxWidth: '96vw', maxHeight: '88vh',
        background: 'var(--bg-card)',
        border: '1px solid rgba(0,212,255,0.18)',
        borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 80px rgba(0,212,255,0.1), 0 40px 100px rgba(0,0,0,0.8)',
        animation: 'modalOpen 0.3s ease forwards',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid rgba(0,212,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0,212,255,0.03)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '3px', color: 'var(--cyan)' }}>
              📚 ZENITH INTELLIGENCE ACADEMY
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              Understanding Maritime Threat Detection
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.25)',
              color: '#ff2d55', cursor: 'pointer', fontSize: '16px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,212,255,0.12)', flexShrink: 0 }}>
          {TOPICS.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                background: active === t.id ? `${t.color}12` : 'transparent',
                borderBottom: active === t.id ? `2px solid ${t.color}` : '2px solid transparent',
                color: active === t.id ? t.color : 'var(--text-secondary)',
                fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
                fontFamily: 'var(--font-main)', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '28px 28px 32px' }}>
          {/* Hero */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px', fontSize: '24px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${topic.color}18`, border: `1px solid ${topic.color}44`,
                boxShadow: `0 0 20px ${topic.color}22`,
              }}>
                {topic.icon}
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: topic.color, letterSpacing: '1px' }}>
                  {topic.headline}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '2px', letterSpacing: '0.5px' }}>
                  {topic.label}
                </div>
              </div>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7', maxWidth: '720px' }}>
              {topic.summary}
            </p>
          </div>

          {/* Sections grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '8px' }}>
            {topic.sections.map((sec, i) => (
              <div key={i} style={{
                background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.1)',
                borderRadius: '10px', padding: '18px',
                transition: 'border-color 0.2s, background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${topic.color}40`; e.currentTarget.style.background = `${topic.color}07` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.1)'; e.currentTarget.style.background = 'rgba(0,212,255,0.03)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '16px' }}>{sec.icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: topic.color, letterSpacing: '0.5px' }}>{sec.title}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.7', margin: 0 }}>
                  {sec.body}
                </p>
              </div>
            ))}
          </div>

          {/* Pipeline visual */}
          <TopicPipeline visual={topic.visual} />
        </div>
      </div>
    </div>
  )
}
