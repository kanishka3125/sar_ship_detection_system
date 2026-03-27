import { useState, useEffect } from 'react'

const STEPS = [
  {
    icon: '🗺️',
    title: '2D Map View',
    desc: 'The main Leaflet map shows all detected vessels in real time. Click any glowing marker to open its intelligence profile. Red = HIGH risk, Amber = MEDIUM, Green = LOW.',
  },
  {
    icon: '🌍',
    title: '3D Globe View',
    desc: 'Switch to the 3D globe for a global overview. Drag to rotate, scroll to zoom. Ship markers are fixed to their real coordinates — they stay put while the Earth rotates beneath them.',
  },
  {
    icon: '⚡',
    title: 'Alerts Panel',
    desc: 'The right-hand panel lists all intelligence alerts sorted by severity. Click any alert to fly the map directly to that vessel and open its profile.',
  },
  {
    icon: '🚫',
    title: 'Threat Types',
    desc: 'DARK VESSEL — ship with no AIS transponder. AIS SPOOF — reported position differs significantly from SAR detection. ZONE VIOLATION — vessel inside an exclusion zone.',
  },
  {
    icon: '📚',
    title: 'Learn',
    desc: 'Click "LEARN" in the top bar to explore educational content about Dark Vessels, AIS Spoofing, and SAR Satellite Imaging.',
  },
]

export default function OnboardingOverlay({ onDismiss }) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(2,5,14,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.4s ease forwards',
    }}>
      {/* Card */}
      <div style={{
        width: '460px', maxWidth: '95vw',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        animation: 'modalOpen 0.35s ease forwards',
      }}>
        {/* Header */}
        <div style={{
          background: 'rgba(0,0,0,0.15)',
          borderBottom: '1px solid var(--border-color)',
          padding: '20px 24px 16px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px', fontWeight: 600,
            color: 'var(--text-primary)', flexShrink: 0,
            border: '1px solid var(--border-bright)',
          }}>Z</div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '2px', color: 'var(--text-primary)' }}>
              ZENITH
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '1px', opacity: 0.8 }}>
              MARITIME INTELLIGENCE PLATFORM
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            STEP {step + 1}/{STEPS.length}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: '2px', background: 'var(--border-color)' }}>
          <div style={{
            height: '100%', background: 'var(--accent)',
            width: `${((step + 1) / STEPS.length) * 100}%`,
            transition: 'width 0.35s ease',
          }} />
        </div>

        {/* Step content */}
        <div style={{ padding: '32px 28px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', filter: 'drop-shadow(0 0 12px rgba(0,212,255,0.3))' }}>
              {STEPS[step].icon}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', letterSpacing: '1px' }}>
              {STEPS[step].title}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', maxWidth: '360px', margin: '0 auto' }}>
              {STEPS[step].desc}
            </div>
          </div>

          {/* Dot indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? '16px' : '6px', height: '4px', borderRadius: '2px',
                  border: 'none', cursor: 'pointer',
                  background: i === step ? 'var(--accent)' : 'var(--border-color)',
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  background: 'rgba(0,212,255,0.06)', color: 'var(--text-secondary)',
                  border: '1px solid rgba(0,212,255,0.15)', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-main)',
                  transition: 'all 0.2s',
                }}
              >
                ← BACK
              </button>
            )}
            <button
              onClick={isLast ? onDismiss : () => setStep(s => s + 1)}
              style={{
                flex: 2, padding: '10px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                fontFamily: 'var(--font-main)', letterSpacing: '1px',
                transition: 'opacity 0.2s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = 0.9}
              onMouseLeave={e => e.currentTarget.style.opacity = 1}
            >
              {isLast ? 'LAUNCH DASHBOARD' : 'NEXT'}
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'transparent', color: 'var(--text-dim)',
                border: '1px solid rgba(0,212,255,0.1)', cursor: 'pointer',
                fontSize: '11px', fontFamily: 'var(--font-main)',
                transition: 'all 0.2s',
              }}
              title="Skip tour"
            >
              SKIP
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
