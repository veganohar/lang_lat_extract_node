// helpers/clusterHelper.js
import { cachedDistance } from '../utils/distanceUtils.js';

export function clusterDeliveriesByDistanceFromBase(deliveries, base, maxWaypoints) {
  const sorted = [...deliveries].sort((a, b) => cachedDistance(base, a) - cachedDistance(base, b));
  const clusters = [];
  for (let i = 0; i < sorted.length; i += maxWaypoints) {
    clusters.push(sorted.slice(i, i + maxWaypoints));
  }
  return clusters;
}
