// utils/distance.js
const distCache = new Map();

export function haversineDistance(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function keyFor(a, b) {
  return `${a.lat},${a.lng}|${b.lat},${b.lng}`;
}

export function cachedDistance(a, b) {
  const k = keyFor(a, b);
  const rk = `${b.lat},${b.lng}|${a.lat},${a.lng}`;
  if (distCache.has(k)) return distCache.get(k);
  if (distCache.has(rk)) return distCache.get(rk);
  const d = haversineDistance(a, b);
  distCache.set(k, d);
  return d;
}

export function clearDistanceCache() {
  distCache.clear();
}
