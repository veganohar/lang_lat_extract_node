#!/usr/bin/env python3
"""
droc_cluster.py

Usage:
  python3 droc_cluster.py '<JSON_INPUT>'

JSON_INPUT example:
{
  "depot": "12.9716,77.5946",
  "waypoints": ["12.9352,77.6245", "12.9970,77.6593", ...],
  "distances": [5300, 7100, ...],   # meters
  "num_clusters": 3,
  "min_per_cluster": 3,
  "max_per_cluster": 7
}
"""
import sys, json, math, itertools, time
import numpy as np
from ortools.constraint_solver import routing_enums_pb2, pywrapcp

# ---------- geometry helpers ----------
def to_point(s):
    lat, lng = s.split(",")
    return float(lat.strip()), float(lng.strip())

def haversine_meters(a, b):
    # a, b = (lat, lon)
    R = 6371000.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    aa = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(aa))

def bearing_from_depot(depot_point, point):
    lat1, lon1 = map(math.radians, depot_point)
    lat2, lon2 = map(math.radians, point)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1)*math.sin(lat2) - math.sin(lat1)*math.cos(lat2)*math.cos(dlon)
    brng = math.degrees(math.atan2(x, y))
    return (brng + 360) % 360

# ---------- TSP (OR-Tools) ----------
def solve_tsp_distance_matrix(distance_matrix, time_limit_seconds=2):
    """Solve TSP on a full distance matrix (list of lists). Returns (order_list, total_distance)."""
    n = len(distance_matrix)
    manager = pywrapcp.RoutingIndexManager(n, 1, 0)  # single vehicle, depot index 0
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        # must return integer
        return int(round(distance_matrix[from_node][to_node]))

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_params.time_limit.seconds = int(time_limit_seconds)
    # allow some search effort, but keep it bounded

    solution = routing.SolveWithParameters(search_params)
    if solution is None:
        # fallback: simple order 0..n-1..0
        order = list(range(n)) + [0]
        total = sum(distance_matrix[i][i+1] for i in range(n-1)) + distance_matrix[n-1][0]
        return order, int(round(total))
    # extract route
    route = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        route.append(node)
        index = solution.Value(routing.NextVar(index))
    # add final depot
    route.append(manager.IndexToNode(index))
    # compute total distance
    total = 0
    for i in range(len(route)-1):
        total += distance_matrix[route[i]][route[i+1]]
    return route, int(round(total))

# ---------- clustering algorithm (Option A) ----------
def initial_bearing_partition(sorted_indices, num_clusters):
    """Split sorted indices (by bearing) into num_clusters contiguous buckets as balanced as possible."""
    n = len(sorted_indices)
    base = n // num_clusters
    rem = n % num_clusters
    clusters = []
    idx = 0
    for k in range(num_clusters):
        size = base + (1 if k < rem else 0)
        clusters.append(sorted_indices[idx: idx + size])
        idx += size
    return clusters

def total_clusters_tsp_cost(clusters_indices, depot_point, points):
    """Compute sum of optimized TSP distances for all clusters. returns list of (order, dist) per cluster and sum."""
    per_cluster_info = []
    total = 0
    for inds in clusters_indices:
        # nodes: 0 = depot, 1..m = waypoints in cluster
        nodes = [depot_point] + [points[i] for i in inds]
        m = len(nodes)
        # build distance matrix
        dm = [[0]*m for _ in range(m)]
        for a in range(m):
            for b in range(m):
                if a == b: dm[a][b] = 0
                else: dm[a][b] = haversine_meters(nodes[a], nodes[b])
        order, dist = solve_tsp_distance_matrix(dm, time_limit_seconds=1)
        # order are indices into nodes (0..m-1)
        # convert order to original waypoint idx order (exclude depot 0 and final depot)
        # route_order_nodes includes depot at start and end
        # Convert nodes indices 1..m-1 to original waypoint indices
        route_wp_indices = []
        for node_idx in order:
            if node_idx == 0:
                continue
            # map node_idx to original index
            route_wp_indices.append(inds[node_idx - 1])
        per_cluster_info.append({"order": route_wp_indices, "distance_m": dist})
        total += dist
    return per_cluster_info, total

def optimize_by_boundary_swaps(clusters, depot_point, points, max_iter=200):
    """
    Try moving single boundary points between adjacent clusters if it improves total TSP sum.
    clusters: list of lists of waypoint indices (in original array)
    """
    improved = True
    it = 0
    while improved and it < max_iter:
        improved = False
        it += 1
        # compute current cost once
        current_info, current_total = total_clusters_tsp_cost(clusters, depot_point, points)
        # iterate boundaries
        for i in range(len(clusters) - 1):
            left = clusters[i]
            right = clusters[i+1]
            if not left or not right:
                continue
            # candidate moves: move last of left -> start of right OR first of right -> end of left
            # we'll try both and keep best if improves
            candidates = []
            # move last of left to right
            cand1 = [list(c) for c in clusters]
            moved = cand1[i].pop(-1)
            cand1[i+1].insert(0, moved)
            candidates.append(cand1)
            # move first of right to left (append)
            cand2 = [list(c) for c in clusters]
            moved2 = cand2[i+1].pop(0)
            cand2[i].append(moved2)
            candidates.append(cand2)

            # evaluate candidates
            best_candidate = None
            best_total = current_total
            best_info = None
            for cand in candidates:
                # quick size checks not included here (caller enforces min/max)
                cand_info, cand_total = total_clusters_tsp_cost(cand, depot_point, points)
                if cand_total < best_total:
                    best_total = cand_total
                    best_candidate = cand
                    best_info = cand_info
            if best_candidate is not None:
                clusters = best_candidate
                improved = True
                # break to restart boundary scanning from first boundary
                break
        # end for boundaries
    return clusters

def enforce_size_constraints(clusters, min_per, max_per):
    """
    Ensure each cluster size is within min_per..max_per by moving items between neighbors greedily.
    Returns adjusted clusters.
    """
    changed = True
    loops = 0
    while changed and loops < 500:
        changed = False
        loops += 1
        for i in range(len(clusters)):
            if len(clusters[i]) > max_per:
                # move farthest-from-depot element to neighbor with smallest size (left or right)
                # we choose last element by position (bearing order) as heuristic
                moved = clusters[i].pop(-1)
                # pick neighbor
                left_size = len(clusters[i-1]) if i-1 >= 0 else 1e9
                right_size = len(clusters[i+1]) if i+1 < len(clusters) else 1e9
                if left_size < right_size:
                    clusters[i-1].append(moved)
                else:
                    if i+1 < len(clusters):
                        clusters[i+1].insert(0, moved)
                    else:
                        clusters[i-1].append(moved)
                changed = True
                break
            if len(clusters[i]) < min_per:
                # take from neighbor with largest size
                left_size = len(clusters[i-1]) if i-1 >= 0 else -1
                right_size = len(clusters[i+1]) if i+1 < len(clusters) else -1
                if left_size > right_size and left_size > min_per:
                    moved = clusters[i-1].pop(-1)
                    clusters[i].insert(0, moved)
                    changed = True
                    break
                elif right_size > min_per:
                    moved = clusters[i+1].pop(0)
                    clusters[i].append(moved)
                    changed = True
                    break
        # end for
    return clusters

# ---------- main flow ----------
def droc_cluster(input_obj):
    depot_str = input_obj["depot"]
    waypoints_str = input_obj["waypoints"]
    distances_m = input_obj["distances"]  # meters
    num_clusters = int(input_obj["num_clusters"])
    min_per = int(input_obj["min_per_cluster"])
    max_per = int(input_obj["max_per_cluster"])

    if not (len(waypoints_str) == len(distances_m)):
        raise ValueError("waypoints and distances must have same length")

    depot_point = to_point(depot_str)
    points = [to_point(s) for s in waypoints_str]
    n = len(points)

    if num_clusters <= 0:
        num_clusters = max(1, n // max_per)

    # compute bearings and sort indices by bearing
    bearings = [bearing_from_depot(depot_point, p) for p in points]
    sorted_by_bearing = sorted(range(n), key=lambda i: bearings[i])

    # initial partition (contiguous segments)
    clusters = initial_bearing_partition(sorted_by_bearing, num_clusters)

    # within each cluster, sort by distance_from_depot ascending (using provided distances)
    for i in range(len(clusters)):
        clusters[i].sort(key=lambda idx: distances_m[idx])

    # enforce size constraints (simple greedy)
    clusters = enforce_size_constraints(clusters, min_per, max_per)

    # improve clusters by boundary swaps using TSP cost as objective
    clusters = optimize_by_boundary_swaps(clusters, depot_point, points, max_iter=100)

    # final per-cluster TSP solve to get orders & distances
    per_cluster_info, total = total_clusters_tsp_cost(clusters, depot_point, points)

    # Prepare outputs: clusters as strings and cluster ids
    clusters_str = []
    for c in clusters:
        clusters_str.append([waypoints_str[idx] for idx in c])
    cluster_ids = [c for c in clusters]

    # per_cluster_info: list with order (waypoint indices in visiting order) and distance_m
    result = {
        "clusters": clusters_str,
        "cluster_ids": cluster_ids,
        "tsp_routes": per_cluster_info,
        "total_distance_m": total
    }
    return result

# ---------- CLI ----------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Please pass JSON payload as first argument. See script header for format.")
        sys.exit(1)
    payload = json.loads(sys.argv[1])
    start = time.time()
    out = droc_cluster(payload)
    end = time.time()
    out["_meta"] = {"runtime_seconds": round(end - start, 3)}
    print(json.dumps(out))
