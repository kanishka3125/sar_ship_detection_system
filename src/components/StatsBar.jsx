const styles = {
  bar: {
    height: 'var(--statsbar-height)',
    background: 'rgba(6,11,24,0.97)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '0',
    flexShrink: 0,
    overflowX: 'auto',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '0 20px',
    borderRight: '1px solid var(--border-color)',
    flexShrink: 0,
  },
  dot: (color) => ({
    width: '7px', height: '7px', borderRadius: '50%',
    background: color, boxShadow: `0 0 6px ${color}`,
    flexShrink: 0,
  }),
  val: (color) => ({
    fontSize: '18px', fontWeight: 700,
    fontFamily: 'var(--font-mono)', color,
    lineHeight: 1,
  }),
  label: {
    fontSize: '9px', color: 'var(--text-secondary)',
    letterSpacing: '1.2px', lineHeight: 1.3,
  },
  badge: (color) => ({
    padding: '3px 8px',
    background: `${color}15`, color,
    border: `1px solid ${color}30`, borderRadius: '4px',
    fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600,
  }),
}

export default function StatsBar({ ships }) {
  const total   = ships.length
  const high    = ships.filter(s => s.risk === 'HIGH').length
  const medium  = ships.filter(s => s.risk === 'MEDIUM').length
  const low     = ships.filter(s => s.risk === 'LOW').length
  const dark    = ships.filter(s => s.ais_status === 'ABSENT').length
  const spoofed = ships.filter(s => s.ais_status === 'SPOOFED').length
  const present = ships.filter(s => s.ais_status === 'PRESENT').length

  const statItems = [
    { label: 'TOTAL VESSELS', val: total,   color: '#00d4ff' },
    { label: 'HIGH RISK',     val: high,    color: '#ff2d55' },
    { label: 'MEDIUM RISK',   val: medium,  color: '#ffb830' },
    { label: 'LOW RISK',      val: low,     color: '#00e676' },
    { label: 'DARK VESSELS',  val: dark,    color: '#ff2d55' },
    { label: 'AIS SPOOFED',   val: spoofed, color: '#ffb830' },
    { label: 'AIS VERIFIED',  val: present, color: '#00e676' },
  ]

  return (
    <div style={styles.bar}>
      {/* Left label */}
      <div style={{ padding: '0 16px 0 0', borderRight: '1px solid var(--border-color)', flexShrink: 0, marginRight: '0' }}>
        <div style={{ fontSize: '9px', color: 'var(--cyan)', letterSpacing: '2px', fontWeight: 700 }}>MARITIME OPS STATUS</div>
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>SAR + AIS FUSION</div>
      </div>
      {statItems.map(item => (
        <div key={item.label} style={styles.item}>
          <div style={styles.dot(item.color)} />
          <div>
            <div style={styles.val(item.color)}>{item.val}</div>
            <div style={styles.label}>{item.label}</div>
          </div>
        </div>
      ))}
      {/* Right: system tag */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', paddingLeft: '16px', flexShrink: 0 }}>
        <span style={styles.badge('#00d4ff')}>YOLOv8</span>
        <span style={styles.badge('#4488ff')}>SENTINEL-1</span>
        <span style={styles.badge('#00e676')}>AIS ACTIVE</span>
      </div>
    </div>
  )
}
