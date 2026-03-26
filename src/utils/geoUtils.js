/**
 * isPointInPolygon
 * Standard Ray Casting algorithm for point-in-polygon detection.
 * @param {number} lat - Target latitude
 * @param {number} lng - Target longitude
 * @param {Array} polygon - Array of [lat, lng] coordinates
 * @returns {boolean}
 */
export function isPointInPolygon(lat, lng, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]

    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)
    
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * findZoneViolation
 * Checks if a ship's coordinate violates any restricted zones.
 */
export function findZoneViolation(lat, lng, zones) {
  for (const zone of zones) {
    if (isPointInPolygon(lat, lng, zone.positions)) {
      return zone
    }
  }
  return null
}
