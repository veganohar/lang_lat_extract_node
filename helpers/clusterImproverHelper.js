// helpers/clusterImprove.js
import { optimizedRoute, routeDistance } from './tspHelper.js';
import { cachedDistance } from '../utils/distanceUtils.js';

export function totalRoutesDistance(routes) {
  return routes.reduce((s, r) => s + routeDistance(r), 0);
}

// tries relocating single deliveries across clusters to reduce total distance
export function tryRelocate(clusters, base, maxWaypoints, maxIter = 1000) {
  let improved = false;
  let iter = 0;

  // precompute current routes & distances
  const routes = clusters.map(cluster => optimizedRoute([base, ...cluster, base]));
  const dists = routes.map(r => routeDistance(r));
  let total = dists.reduce((a, b) => a + b, 0);

  while (iter++ < maxIter) {
    let didSomething = false;

    // for each cluster A and delivery idx in it
    for (let a = 0; a < clusters.length; a++) {
      const clusterA = clusters[a];
      if (!clusterA.length) continue;

      for (let idx = 0; idx < clusterA.length; idx++) {
        const item = clusterA[idx];

        // try moving item to each other cluster b
        for (let b = 0; b < clusters.length; b++) {
          if (b === a) continue;
          if (clusters[b].length + 1 > maxWaypoints) continue;

          // build candidate clusters
          const newA = clusterA.slice(0, idx).concat(clusterA.slice(idx + 1));
          const newB = clusters[b].concat([item]);

          // compute routes only for A and B
          const routeA_new = optimizedRoute([base, ...newA, base]);
          const routeB_new = optimizedRoute([base, ...newB, base]);

          const newTotal = total - dists[a] - dists[b] + routeDistance(routeA_new) + routeDistance(routeB_new);

          if (newTotal + 1e-6 < total) {
            // accept move
            clusters[a] = newA;
            clusters[b] = newB;
            routes[a] = routeA_new;
            routes[b] = routeB_new;
            dists[a] = routeDistance(routeA_new);
            dists[b] = routeDistance(routeB_new);
            total = newTotal;
            didSomething = true;
            improved = true;
            break; // break b loop, restart scanning
          }
        }
        if (didSomething) break;
      }
      if (didSomething) break;
    }

    if (!didSomething) break;
  }

  return { clusters, improved };
}

// try swapping one item from A with one item from B
export function trySwap(clusters, base, maxWaypoints, maxIter = 1000) {
  let improved = false;
  let iter = 0;
  const routes = clusters.map(cluster => optimizedRoute([base, ...cluster, base]));
  const dists = routes.map(r => routeDistance(r));
  let total = dists.reduce((a, b) => a + b, 0);

  while (iter++ < maxIter) {
    let didSomething = false;
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const A = clusters[a], B = clusters[b];
        for (let i = 0; i < A.length; i++) {
          for (let j = 0; j < B.length; j++) {
            const Anew = A.slice(); Anew.splice(i, 1, B[j]);
            const Bnew = B.slice(); Bnew.splice(j, 1, A[i]);

            const routeA_new = optimizedRoute([base, ...Anew, base]);
            const routeB_new = optimizedRoute([base, ...Bnew, base]);
            const newTotal = total - dists[a] - dists[b] + routeDistance(routeA_new) + routeDistance(routeB_new);

            if (newTotal + 1e-6 < total) {
              clusters[a] = Anew;
              clusters[b] = Bnew;
              routes[a] = routeA_new;
              routes[b] = routeB_new;
              dists[a] = routeDistance(routeA_new);
              dists[b] = routeDistance(routeB_new);
              total = newTotal;
              didSomething = true;
              improved = true;
              break;
            }
          }
          if (didSomething) break;
        }
        if (didSomething) break;
      }
      if (didSomething) break;
    }
    if (!didSomething) break;
  }

  return { clusters, improved };
}

export function improveClusters(clusters, base, maxWaypoints, maxOuterIter) {
  let changed = true;
  let outer = 0;
  while (changed && outer++ < maxOuterIter) {
    changed = false;
    const r1 = tryRelocate(clusters, base, maxWaypoints, 1000);
    clusters = r1.clusters;
    if (r1.improved) changed = true;

    const r2 = trySwap(clusters, base, maxWaypoints, 1000);
    clusters = r2.clusters;
    if (r2.improved) changed = true;
  }
  return clusters;
}
