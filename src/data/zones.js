/**
 * RESTRICTED_ZONES
 * Defines maritime zones for geo-fencing detection.
 * Positions are [lat, lng] polygons.
 */
export const RESTRICTED_ZONES = [
  {
    id: 'ZONE-KCH-01',
    name: 'Naval Exclusion Zone — Kochi',
    type: 'RESTRICTED',
    color: '#ff2d55',
    positions: [
      [9.5, 75.8], [9.5, 76.6], [10.4, 76.6], [10.4, 75.8]
    ]
  },
  {
    id: 'ZONE-EEZ-02',
    name: 'EEZ Fishing Restriction Zone',
    type: 'EEZ_BOUNDARY',
    color: '#ffb830',
    positions: [
      [10.2, 78.5], [10.2, 80.2], [11.5, 80.2], [11.5, 78.5]
    ]
  },
  {
    id: 'ZONE-CHN-03',
    name: 'Port Exclusion Zone — Chennai',
    type: 'RESTRICTED',
    color: '#ff2d55',
    positions: [
      [12.8, 79.8], [12.8, 80.6], [13.4, 80.6], [13.4, 79.8]
    ]
  },
  {
    id: 'ZONE-MSR-04',
    name: 'MSR Deep Water Operations',
    type: 'MILITARY',
    color: '#00d4ff',
    positions: [
      [11.8, 81.2], [11.8, 82.5], [12.8, 82.5], [12.8, 81.2]
    ]
  }
]
