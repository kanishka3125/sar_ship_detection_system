const styles = {
  bar: {
    height: 'var(--statsbar-height)',
    background: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex', alignItems: 'center', padding: '0 20px',
    flexShrink: 0, overflowX: 'auto',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '0 18px', borderRight: '1px solid var(--border-color)', flexShrink: 0,
  },
  dot: (color) => ({
    width: '5px', height: '5px', borderRadius: '50%',
    background: color, flexShrink: 0,
    opacity: 0.8,
  }),
  val: (color) => ({
    fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)', color, lineHeight: 1,
  }),
  label: { 
    fontSize: '8px', color: 'var(--text-secondary)', 
    letterSpacing: '1px', lineHeight: 1.3, fontWeight: 500,
    textTransform: 'uppercase'
  },
}

export default function StatsBar({ ships, loiteringCount = 0 }) {
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
    { label: 'TOTAL',         val: total,            color: 'var(--text-primary)' },
    { label: 'HIGH RISK',     val: high,             color: 'var(--text-primary)' },
    { label: 'MEDIUM RISK',   val: medium,           color: 'var(--text-secondary)' },
    { label: 'LOW RISK',      val: low,              color: 'var(--text-dim)' },
    { label: 'DARK VESSELS',  val: dark,             color: 'var(--text-primary)' },
    { label: 'LOITERING',     val: loiteringCount,   color: 'var(--text-secondary)' },
    { label: 'AVG CONFIDENCE',val: `${avgConf}%`,    color: 'var(--text-primary)' },
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

    </div>
  )
}
