import json
import sys
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

def main():
    if len(sys.argv) < 2:
        print("Usage: python vrp_solver.py <num_vehicles>")
        sys.exit(1)

    num_vehicles = int(sys.argv[1])

    # Load distance matrix
    with open("distance_matrix.json", "r") as f:
        distance_matrix = json.load(f)

    num_locations = len(distance_matrix)

    # Routing index manager
    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, 0)

    # Routing model
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # -------------------
    # Capacity dimension
    # Each location counts as 1 stop
    def demand_callback(from_index):
        return 1

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    max_stops_per_vehicle = (num_locations // num_vehicles) + 1
    routing.AddDimension(
        demand_callback_index,
        0,  # slack
        max_stops_per_vehicle,  # max stops per vehicle
        True,  # start cumul to zero
        "Capacity"
    )
    # -------------------

    # First solution strategy
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC

    # Solve
    solution = routing.SolveWithParameters(search_parameters)

    trips = []
    if solution:
        for vehicle_id in range(num_vehicles):
            index = routing.Start(vehicle_id)
            route = []
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                route.append(node)
                index = solution.Value(routing.NextVar(index))
            route.append(manager.IndexToNode(index))  # End at depot
            trips.append(route)
    else:
        trips = [[0]] * num_vehicles  # fallback

    print(json.dumps(trips))


if __name__ == "__main__":
    main()
