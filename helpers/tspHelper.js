// helpers/tspHelper.js
import { cachedDistance } from '../utils/distanceUtils.js';

// locations: [base, ...deliveries..., base]
// returns: [base, ...optimized deliveries..., base]
export function optimizedRoute(locations) {
  if (!locations || locations.length <= 2) return locations.slice();

  const start = locations[0];
  const end = locations[locations.length - 1];
  const mid = locations.slice(1, -1).slice(); // copy

  // Nearest Neighbor starting from start (choose nearest from start to begin)
  const visited = [];
  let current = start;

  while (mid.length) {
    let bestIdx = 0;
    let bestDist = cachedDistance(current, mid[0]);
    for (let i = 1; i < mid.length; i++) {
      const d = cachedDistance(current, mid[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    current = mid.splice(bestIdx, 1)[0];
    visited.push(current);
  }

  // 2-opt on visited (only mid points)
  let improved = true;
  const max2OptIters = 1000;
  let iter = 0;
  while (improved && iter++ < max2OptIters) {
    improved = false;
    for (let i = 0; i < visited.length - 1; i++) {
      for (let j = i + 1; j < visited.length; j++) {
        const a = (i === 0) ? start : visited[i - 1];
        const b = visited[i];
        const c = visited[j];
        const d = (j === visited.length - 1) ? end : visited[j + 1];
        const oldDist = cachedDistance(a, b) + cachedDistance(c, d);
        const newDist = cachedDistance(a, c) + cachedDistance(b, d);
        if (newDist + 1e-9 < oldDist) {
          const rev = visited.slice(i, j + 1).reverse();
          visited.splice(i, j - i + 1, ...rev);
          improved = true;
        }
      }
    }
  }

  return [start, ...visited, end];
}

export function routeDistance(route) {
  if (!route || route.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < route.length; i++) sum += cachedDistance(route[i - 1], route[i]);
  return sum;
}
