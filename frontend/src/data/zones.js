/**
 * RESTRICTED_ZONES
 * Defines maritime zones for geo-fencing detection.
 * Positions are [lat, lng] polygons.
 *
 * labelShort    → compact label shown by default
 * labelDirection → Leaflet Tooltip direction for offset
 * labelOffset   → [x, y] pixel offset to stagger overlapping labels
 */
export const RESTRICTED_ZONES = [
  {
    id: 'ZONE-KCH-01',
    name: 'Naval Exclusion Zone — Kochi',
    labelShort: 'Kochi Zone',
    labelDirection: 'left',
    labelOffset: [-12, 0],
    type: 'RESTRICTED',
    color: '#ff2d55',
    positions: [
      [9.5, 75.8], [9.5, 76.6], [10.4, 76.6], [10.4, 75.8]
    ]
  },
  {
    id: 'ZONE-EEZ-02',
    name: 'EEZ Fishing Restriction Zone',
    labelShort: 'EEZ Zone',
    labelDirection: 'top',
    labelOffset: [0, -12],
    type: 'EEZ_BOUNDARY',
    color: '#ffb830',
    positions: [
      [10.2, 78.5], [10.2, 80.2], [11.5, 80.2], [11.5, 78.5]
    ]
  },
  {
    id: 'ZONE-CHN-03',
    name: 'Port Exclusion Zone — Chennai',
    labelShort: 'Chennai Zone',
    labelDirection: 'right',
    labelOffset: [12, 0],
    type: 'RESTRICTED',
    color: '#ff2d55',
    positions: [
      [12.8, 79.8], [12.8, 80.6], [13.4, 80.6], [13.4, 79.8]
    ]
  },
  {
    id: 'ZONE-MSR-04',
    name: 'MSR Deep Water Operations',
    labelShort: 'MSR Zone',
    labelDirection: 'bottom',
    labelOffset: [0, 12],
    type: 'MILITARY',
    color: '#00d4ff',
    positions: [
      [11.8, 81.2], [11.8, 82.5], [12.8, 82.5], [12.8, 81.2]
    ]
  }
]
