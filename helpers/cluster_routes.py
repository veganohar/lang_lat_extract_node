from sklearn.cluster import KMeans
# from geopy.distance import geodesic
import math
import numpy as np
import itertools
import sys, json


def bearing_from_depot(depot, point):
    """Calculate bearing (angle) from depot to a waypoint in degrees."""
    lat1, lon1 = map(math.radians, depot)
    lat2, lon2 = map(math.radians, point)
    dlon = lon2 - lon1

    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1)*math.sin(lat2) - math.sin(lat1)*math.cos(lat2)*math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360

def cluster_waypoints(depot, waypoint_strs, distances_from_depot, num_clusters, min_per_cluster, max_per_cluster):
    """
    Cluster waypoints based on travel distance + bearing from depot.
    Automatically balances cluster sizes to stay within limits.
    """
    depot = tuple(map(float, depot.split(",")))
    waypoints = [tuple(map(float, w.split(","))) for w in waypoint_strs]

    if len(waypoints) != len(distances_from_depot):
        raise ValueError("waypoints and distances_from_depot must have the same length")

    # Step 1: Compute features (distance from depot + bearing)
    features = []
    for i, p in enumerate(waypoints):
        dist = distances_from_depot[i] / 1000 # use provided road distance
        bear = bearing_from_depot(depot, p)
        features.append([dist, bear])
    features = np.array(features)

    # Step 2: KMeans clustering
    kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(features)

    # Step 3: Organize clusters
    clusters = {i: [] for i in range(num_clusters)}
    for idx, lbl in enumerate(labels):
        clusters[lbl].append(idx)

    # Step 4: Sort clusters by bearing (for smoother direction grouping)
    cluster_centroids = [np.mean(features[clusters[i]], axis=0) for i in range(num_clusters)]
    sorted_order = sorted(range(num_clusters), key=lambda i: cluster_centroids[i][1])
    clusters = {i: clusters[k] for i, k in enumerate(sorted_order)}

    # Step 5: Rebalance clusters based on min/max constraints
    clusters = rebalance_clusters(clusters, features, min_per_cluster, max_per_cluster)

    # Step 6: Prepare output
    clustered_points = []
    clustered_indexes = []
    for _, indices in clusters.items():
        clustered_points.append([waypoint_strs[i] for i in indices])
        clustered_indexes.append(indices)

    return clustered_points, clustered_indexes


def rebalance_clusters(clusters, features, min_per_cluster, max_per_cluster):
    """Adjust cluster membership so all stay within [min, max] while minimizing internal distances."""
    def intra_cluster_distance(idxs):
        if len(idxs) < 2:
            return 0
        points = [features[i] for i in idxs]
        total = 0
        for a, b in itertools.combinations(points, 2):
            total += math.dist(a, b)
        return total

    changed = True
    while changed:
        changed = False
        cluster_keys = list(clusters.keys())

        for i in range(len(cluster_keys) - 1):
            left, right = clusters[cluster_keys[i]], clusters[cluster_keys[i + 1]]
            if not left or not right:
                continue

            # Handle oversize clusters
            if len(left) > max_per_cluster:
                far_idx = max(left, key=lambda x: features[x][0])
                left.remove(far_idx)
                right.append(far_idx)
            elif len(right) > max_per_cluster:
                far_idx = max(right, key=lambda x: features[x][0])
                right.remove(far_idx)
                left.append(far_idx)

            # Handle undersize clusters
            elif len(left) < min_per_cluster and len(right) > min_per_cluster:
                near_idx = min(right, key=lambda x: abs(features[x][0] - np.mean([features[y][0] for y in left])))
                right.remove(near_idx)
                left.append(near_idx)
            elif len(right) < min_per_cluster and len(left) > min_per_cluster:
                near_idx = min(left, key=lambda x: abs(features[x][0] - np.mean([features[y][0] for y in right])))
                left.remove(near_idx)
                right.append(near_idx)
            else:
                continue

            old_dist = intra_cluster_distance(left) + intra_cluster_distance(right)
            new_dist = intra_cluster_distance(left) + intra_cluster_distance(right)

            if new_dist < old_dist * 0.9:  # 10% improvement threshold
                changed = True

    return clusters


if __name__ == "__main__":

        # When called from Node.js
        input_data = json.loads(sys.argv[1])

        depot = input_data["depot"]
        waypoints = input_data["waypoints"]
        distances = input_data["distances"]
        num_clusters = input_data["num_clusters"]
        min_per_cluster = input_data["min_per_cluster"]
        max_per_cluster = input_data["max_per_cluster"]

        clusters, cluster_ids = cluster_waypoints(
            depot, waypoints, distances, num_clusters, min_per_cluster, max_per_cluster
        )

        result = {
            "clusters": clusters,
            "cluster_ids": cluster_ids
        }
        print(json.dumps(result))
    
