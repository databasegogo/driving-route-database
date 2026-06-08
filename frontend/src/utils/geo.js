// Ray-casting：判斷點是否在單一環內
export function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// 支援 Polygon 和 MultiPolygon
export function pointInPolygon(lat, lng, geojson) {
  if (!geojson) return false
  const { type, coordinates } = geojson.geometry
  if (type === 'Polygon') return pointInRing(lat, lng, coordinates[0])
  if (type === 'MultiPolygon') return coordinates.some(p => pointInRing(lat, lng, p[0]))
  return false
}
