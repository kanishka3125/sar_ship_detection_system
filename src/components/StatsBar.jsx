const styles = {
  bar: {
    height: 'var(--statsbar-height)',
    background: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex', alignItems: 'center', padding: '0 20px',
    flexShrink: 0, overflowX: 'auto',
    boxShadow: '0 -1px 0 var(--border-color)',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '0 18px', borderRight: '1px solid var(--border-color)', flexShrink: 0,
  },
  dot: (color) => ({
    width: '7px', height: '7px', borderRadius: '50%',
    background: color, boxShadow: `0 0 7px ${color}`,
    flexShrink: 0, animation: 'live-blink 2s ease-in-out infinite',
  }),
  val: (color) => ({
    fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1,
  }),
  label: { fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '1.2px', lineHeight: 1.3 },
  badge: (color) => ({
    padding: '3px 8px', background: `${color}14`, color,
    border: `1px solid ${color}28`, borderRadius: '4px',
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
  const avgConf = ships.length
    ? Math.round(ships.reduce((a, s) => a + (s.confidence || 0), 0) / ships.length * 100)
    : 0

  const statItems = [
    { label: 'TOTAL VESSELS', val: total,            color: '#00d4ff' },
    { label: 'HIGH RISK',     val: high,             color: '#ff2d55' },
    { label: 'MEDIUM RISK',   val: medium,           color: '#ffb830' },
    { label: 'LOW RISK',      val: low,              color: '#00e676' },
    { label: 'DARK VESSELS',  val: dark,             color: '#ff2d55' },
    { label: 'AIS SPOOFED',   val: spoofed,          color: '#ffb830' },
    { label: 'AIS VERIFIED',  val: present,          color: '#00e676' },
    { label: 'AVG CONFIDENCE',val: `${avgConf}%`,    color: '#4488ff' },
  ]

  return (
    <div style={styles.bar}>
      {/* Left label */}
      <div style={{ padding: '0 16px 0 0', borderRight: '1px solid var(--border-color)', flexShrink: 0, marginRight: '0' }}>
        <div style={{ fontSize: '9px', color: 'var(--cyan)', letterSpacing: '2px', fontWeight: 700 }}>MARITIME OPS</div>
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
      {/* System badges */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', paddingLeft: '16px', flexShrink: 0 }}>
        <span style={styles.badge('#00d4ff')}>YOLOv8</span>
        <span style={styles.badge('#4488ff')}>SENTINEL-1</span>
        <span style={styles.badge('#00e676')}>AIS ACTIVE</span>
      </div>
    </div>
  )
}
