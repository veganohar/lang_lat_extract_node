import { riderSlot } from "./planningSchedule.js";
import { coordinates } from "./multipleTrips.js";
import { FLAVOUR_KEYS } from "../data/flavourKeys.js";
const toGoogleLocation = (value) => {
    const [latitude, longitude] = value.split(",").map(Number);
    return {
        latitude,
        longitude
    };
};
const parseGoogleDuration = (value) => {
    if (!/^\d+(\.\d+)?s$/.test(value ?? "0s"))
        throw Error("Google returned an invalid route duration");
    return Number((value ?? "0s").slice(0, -1));
};
const estimateStraightLineKm = (a, b) => {
    const x = toGoogleLocation(a),
        y = toGoogleLocation(b);
    return Math.hypot((x.latitude - y.latitude) * 111, (x.longitude - y.longitude) * 106);
};
export function hardCaps(options) {
    const strategy = options.strategy ?? "time",
        all = ["hybrid", "best"].includes(strategy);
    return {
        maxHours: all || strategy === "time" ? options.maxHours : undefined,
        maxDistanceKm: all || strategy === "distance" ? options.maxDistanceKm : undefined,
        maxCurd: all || strategy === "capacity" ? options.maxCurd : undefined
    };
}
export function validateAutoLimits(options) {
    const strategy = options.strategy ?? "time";
    if (!["time", "distance", "capacity", "hybrid", "best"].includes(strategy))
        throw Error("Choose Working hours, Distance, Capacity, Hybrid or Best plan.");
    const caps = hardCaps(options),
        valid = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
    if (
        caps.maxHours !== undefined &&
        (!valid(caps.maxHours) || caps.maxHours < 0.5 || caps.maxHours % 0.5 !== 0)
    )
        throw Error("Working hours must be positive 0.5-hour increments.");
    if (caps.maxDistanceKm !== undefined && !valid(caps.maxDistanceKm))
        throw Error("Maximum road kilometres must be positive.");
    if (caps.maxCurd !== undefined && (!valid(caps.maxCurd) || !Number.isInteger(caps.maxCurd)))
        throw Error("Maximum curd boxes must be a positive integer.");
    if (
        typeof options.serviceMinutes !== "number" ||
        !Number.isFinite(options.serviceMinutes) ||
        options.serviceMinutes < 0
    )
        throw Error("Average service minutes must be non-negative.");
    if (!Number.isInteger(options.riderCount ?? 1) || (options.riderCount ?? 1) < 1)
        throw Error("Rider count must be a positive integer.");
}
export function autoRequest(
    rows,
    options,
    depot,
    vehicleCount,
    { sequence = false, hints = [] } = {}
) {
    const caps = sequence ? {} : hardCaps(options),
        riders = options.riderCount ?? 1;
    const objective = options.objective ?? getPlanningObjectives(options.strategy)[0];
    const horizon = 7 * 86400;
    const vehicles = Array.from(
        {
            length: vehicleCount
        },
        (_, index) => {
            const slot = sequence
                ? {
                      departureTime: options.departureTime
                  }
                : riderSlot(options.departureTime, index + (options.slotOffset ?? 0), riders);
            let end =
                Date.parse(slot.departureTime) +
                (caps.maxHours ? caps.maxHours * 3600 : horizon) * 1000;
            // The same rider cannot depart on a later day while still on this route.
            if (!sequence)
                end = Math.min(
                    end,
                    Date.parse(
                        riderSlot(
                            options.departureTime,
                            index + (options.slotOffset ?? 0) + riders,
                            riders
                        ).departureTime
                    )
                );
            return {
                label: String(index),
                travelMode: "TWO_WHEELER",
                startLocation: toGoogleLocation(depot),
                endLocation: toGoogleLocation(depot),
                startTimeWindows: [
                    {
                        startTime: slot.departureTime,
                        endTime: slot.departureTime
                    }
                ],
                endTimeWindows: [
                    {
                        startTime: slot.departureTime,
                        endTime: new Date(end).toISOString()
                    }
                ],
                costPerKilometer: sequence ? 1 : objective === "distance-first" ? 10 : 1,
                ...(!sequence
                    ? {
                          fixedCost:
                              objective === "capacity-first"
                                  ? 200000 + index * 0.01
                                  : 100000 + index * 0.01,
                          costPerHour: objective === "time-first" ? 20 + index : index * 0.1
                      }
                    : {}),
                ...(caps.maxHours
                    ? {
                          routeDurationLimit: {
                              maxDuration: options.maxHours * 3600 + "s"
                          }
                      }
                    : {}),
                ...(caps.maxDistanceKm
                    ? {
                          routeDistanceLimit: {
                              maxMeters: String(Math.floor(caps.maxDistanceKm * 1000))
                          }
                      }
                    : {}),
                ...(caps.maxCurd
                    ? {
                          loadLimits: {
                              curd: {
                                  maxLoad: String(caps.maxCurd * 1000)
                              }
                          }
                      }
                    : {})
            };
        }
    );
    const end = Math.max(...vehicles.map((v) => Date.parse(v.endTimeWindows[0].endTime)));
    return {
        label: sequence ? "frostie-sequence" : "frostie-" + objective,
        timeout: sequence ? "30s" : "60s",
        populatePolylines: true,
        considerRoadTraffic: true,
        ...(!sequence && hints.length
            ? {
                  injectedFirstSolutionRoutes: hints.map((indices, vehicleIndex) => ({
                      vehicleIndex,
                      visits: indices.map((shipmentIndex) => ({
                          shipmentIndex,
                          visitRequestIndex: 0,
                          isPickup: false
                      }))
                  }))
              }
            : {}),
        model: {
            globalStartTime: options.departureTime,
            globalEndTime: new Date(end).toISOString(),
            vehicles,
            shipments: rows.map((row, index) => ({
                label: String(index),
                ...(!sequence
                    ? {
                          penaltyCost: 1000000000,
                          costsPerVehicle: Array.from(
                              {
                                  length: vehicleCount
                              },
                              (_, vehicle) =>
                                  (estimateStraightLineKm(depot, row.latLng) * 0.5 * vehicle) /
                                      Math.max(1, vehicleCount - 1) +
                                  (objective === "capacity-first" ? row.curd * vehicle * 5 : 0)
                          )
                      }
                    : {}),
                ...(caps.maxCurd && row.curd > 0
                    ? {
                          loadDemands: {
                              curd: {
                                  amount: String(Math.round(row.curd * 1000))
                              }
                          }
                      }
                    : {}),
                deliveries: [
                    {
                        arrivalLocation: toGoogleLocation(row.latLng),
                        duration: options.serviceMinutes * 60 + "s"
                    }
                ]
            }))
        }
    };
}
// Validate the provider's *whole* depot loop before exposing any assignment.
export function parseAutoResponse(
    data,
    rows,
    options,
    depot,
    vehicleCount,
    { sequence = false } = {}
) {
    if (!Array.isArray(data.routes))
        throw Error("Google omitted auto-split routes; no plan was verified.");
    const caps = sequence ? {} : hardCaps(options),
        riders = options.riderCount ?? 1;
    const identities = new Set();
    for (const route of data.routes)
        for (const visit of route.visits ?? []) {
            const i = visit.shipmentIndex ?? 0;
            if (
                !Number.isInteger(i) ||
                !rows[i] ||
                identities.has(i) ||
                visit.isPickup ||
                (visit.visitRequestIndex ?? 0) !== 0
            )
                throw Error("Google returned duplicate or invalid order identities.");
            identities.add(i);
        }
    const rejected = new Set(),
        used = new Set(),
        vehicles = new Set(),
        trips = [];
    let trafficRejectedRoutes = 0;
    for (const route of data.routes) {
        const index = route.vehicleIndex ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= vehicleCount || vehicles.has(index))
            throw Error("Google returned duplicate or invalid trip identity.");
        vehicles.add(index);
        if (!route.visits?.length) continue;
        if (route.hasTrafficInfeasibilities && !sequence) {
            trafficRejectedRoutes++;
            for (const visit of route.visits) rejected.add(visit.shipmentIndex ?? 0);
            continue;
        }
        if (
            !Array.isArray(route.transitions) ||
            route.transitions.length !== route.visits.length + 1
        )
            throw Error("Google omitted depot-to-depot road legs.");
        const slot = sequence
            ? {
                  departureTime: options.departureTime
              }
            : riderSlot(options.departureTime, index + (options.slotOffset ?? 0), riders);
        if (Date.parse(route.vehicleStartTime) !== Date.parse(slot.departureTime))
            throw Error("Google changed the requested departure.");
        const legs = route.transitions.map((leg) => {
            const seconds = parseGoogleDuration(leg.travelDuration),
                meters = leg.travelDistanceMeters ?? 0;
            if (!Number.isFinite(meters) || meters < 0)
                throw Error("Google returned invalid road distance");
            return {
                seconds,
                meters
            };
        });
        let previous = Date.parse(slot.departureTime);
        const stops = [],
            indices = [];
        for (const [position, visit] of route.visits.entries()) {
            const shipmentIndex = visit.shipmentIndex ?? 0,
                stop = rows[shipmentIndex],
                arrival = Date.parse(visit.startTime);
            if (
                !Number.isInteger(shipmentIndex) ||
                !stop ||
                used.has(shipmentIndex) ||
                visit.isPickup ||
                (visit.visitRequestIndex ?? 0) !== 0
            )
                throw Error(
                    "Google dropped/duplicated an order identity or returned an invalid visit."
                );
            if (
                !Number.isFinite(arrival) ||
                (!sequence && arrival + 1 < previous + legs[position].seconds * 1000)
            )
                throw Error("Google stop timing does not verify travel and service.");
            previous = arrival + options.serviceMinutes * 60000;
            used.add(shipmentIndex);
            indices.push(shipmentIndex);
            stops.push({
                ...stop,
                plannedArrival: visit.startTime,
                plannedServiceEnd: new Date(previous).toISOString()
            });
        }
        const end = Date.parse(route.vehicleEndTime),
            totalSeconds = (end - Date.parse(slot.departureTime)) / 1000;
        if (
            !Number.isFinite(end) ||
            (!sequence && end > Date.parse(slot.departureTime) + 86400000 + 0.001) ||
            (!sequence && end + 1 < previous + legs.at(-1).seconds * 1000) ||
            totalSeconds > (caps.maxHours ? caps.maxHours * 3600 : 7 * 86400) + 0.001
        )
            throw Error("Google route exceeds working hours or omits service/depot return.");
        const roadSeconds = legs.reduce((n, l) => n + l.seconds, 0),
            totalMeters = legs.reduce((n, l) => n + l.meters, 0),
            serviceSeconds = stops.length * options.serviceMinutes * 60;
        if (!sequence && totalSeconds + 0.001 < roadSeconds + serviceSeconds)
            throw Error("Google route total does not include all work.");
        if (caps.maxDistanceKm && totalMeters > caps.maxDistanceKm * 1000 + 0.001)
            throw Error("Google route exceeds maximum depot-to-depot road kilometres.");
        const totalCurd = stops.reduce((n, s) => n + s.curd, 0);
        if (caps.maxCurd && totalCurd > caps.maxCurd + 0.000001)
            throw Error("Google route exceeds maximum curd-box capacity.");
        const encoded = route.routePolyline?.points ?? "";
        if (totalMeters > 0 && !encoded) throw Error("Google omitted verified route geometry.");
        trips.push({
            depot,
            stops,
            indices,
            legs,
            departureTime: slot.departureTime,
            riderSlot: slot.riderSlot ?? 1,
            dayIndex: slot.dayIndex ?? 0,
            limits: {
                ...caps,
                serviceMinutes: options.serviceMinutes
            },
            totalSeconds,
            roadSeconds,
            serviceSeconds,
            waitingSeconds: Math.max(0, totalSeconds - roadSeconds - serviceSeconds),
            totalMeters,
            totalCurd: stops.reduce((n, s) => n + s.curd, 0),
            totalIcecream: stops.reduce((n, s) => n + s.icecream, 0),
            trafficAware: true,
            roadPolylines: encoded ? [encoded] : [],
            configurationIndex: index,
            verificationStatus: sequence ? "sequence-only" : "verified"
        });
    }
    if (!sequence)
        for (const trip of trips) {
            const next = trips
                .filter(
                    (other) => other.riderSlot === trip.riderSlot && other.dayIndex > trip.dayIndex
                )
                .sort((a, b) => a.dayIndex - b.dayIndex)[0];
            if (
                next &&
                Date.parse(trip.departureTime) + trip.totalSeconds * 1000 >
                    Date.parse(next.departureTime) + 1
            )
                throw Error("A rider would be double-booked across calendar days.");
        }
    const skipped = new Map();
    for (const skip of data.skippedShipments ?? []) {
        const index = skip.index ?? 0;
        if (!Number.isInteger(index) || !rows[index] || identities.has(index) || skipped.has(index))
            throw Error("Google returned inconsistent skipped order identities.");
        skipped.set(index, skip);
    }
    const unassigned = [];
    rows.forEach((stop, index) => {
        if (!used.has(index))
            unassigned.push({
                ...stop,
                reason: rejected.has(index)
                    ? "Google traffic-adjusted timings were infeasible for this route; not assigned or verified."
                    : skipped.has(index)
                      ? "Google could not assign within the selected hard caps and rider schedule."
                      : "Google omitted this order from routes and skip accounting; not assigned."
            });
    });
    return {
        trips,
        unassigned,
        assignedCount: used.size,
        trafficRejectedRoutes
    };
}
export function initialAutoBatches(first, options, depot) {
    const caps = hardCaps(options),
        average = first.totalMeters > 0 ? first.roadSeconds / (first.totalMeters / 1000) : 120;
    const entries = first.stops.map((stop, index) => ({
        stop,
        index,
        shipment: first.indices[index]
    }));
    if (options.objective === "capacity-first")
        entries.sort((a, b) => b.stop.curd - a.stop.curd || a.index - b.index);
    const batches = [];
    let current = [],
        work = 0,
        load = 0,
        km = 0,
        previous = depot;
    for (const entry of entries) {
        const outbound = estimateStraightLineKm(previous, entry.stop.latLng),
            back = estimateStraightLineKm(depot, entry.stop.latLng);
        if (
            current.length &&
            ((caps.maxHours &&
                work + (outbound + back) * average + options.serviceMinutes * 60 >
                    caps.maxHours * 3600) ||
                (caps.maxDistanceKm && km + outbound + back > caps.maxDistanceKm) ||
                (caps.maxCurd && load + entry.stop.curd > caps.maxCurd))
        ) {
            batches.push(current);
            current = [];
            work = 0;
            load = 0;
            km = 0;
            previous = depot;
        }
        const leg = estimateStraightLineKm(previous, entry.stop.latLng);
        km += leg;
        work += leg * average + options.serviceMinutes * 60;
        load += entry.stop.curd;
        current.push(entry.shipment);
        previous = entry.stop.latLng;
    }
    if (current.length) batches.push(current);
    return batches;
}
export function compareVerifiedCandidates(a, b) {
    if (a.status === "unavailable") return b.status === "unavailable" ? 0 : 1;
    if (b.status === "unavailable") return -1;
    return (
        Number(b.fullCoverage) - Number(a.fullCoverage) ||
        b.assignedCount - a.assignedCount ||
        a.tripCount - b.tripCount ||
        a.combinedMeters - b.combinedMeters ||
        a.totalSeconds - b.totalSeconds
    );
}
function createCachedOptimizer(optimize, providerState) {
    const requests = new Map();
    return (request) => {
        const requestKey = JSON.stringify(request);
        if (requests.has(requestKey)) return requests.get(requestKey);
        providerState.calls++;
        const response = Promise.resolve()
            .then(() => optimize(request))
            .then((data) => {
                console.info(
                    "[multipleTrips provider]",
                    JSON.stringify({
                        stage: request.label,
                        slots: request.model.vehicles.length,
                        routes: data.routes?.length ?? 0,
                        trafficInfeasibleRoutes:
                            data.routes?.filter((route) => route.hasTrafficInfeasibilities)
                                .length ?? 0
                    })
                );
                return data;
            })
            .catch((error) => {
                error.isProviderError = true;
                providerState.failed = true;
                throw error;
            });
        requests.set(requestKey, response);
        return response;
    };
}
function getPlanningObjectives(strategy) {
    if (strategy === "best") return ["time-first", "distance-first", "capacity-first"];
    if (strategy === "distance") return ["distance-first"];
    if (strategy === "capacity") return ["capacity-first"];
    return ["time-first"];
}
function getDenseTripPrefix(trips) {
    const prefix = [];
    for (const trip of trips) {
        if (trip.configurationIndex !== prefix.length) break;
        prefix.push(trip);
    }
    return prefix;
}
async function recoverOutstanding(result, rows, options, depot, optimize) {
    const orderIndexByRowId = new Map(rows.map((row, index) => [row.rowId, index])),
        limits = hardCaps(options),
        infeasibleRowIds = new Set();
    let recoveryAttempts = 0;
    result.unassigned = result.unassigned.map((row) => {
        if (limits.maxCurd && row.curd > limits.maxCurd) {
            infeasibleRowIds.add(row.rowId);
            return {
                ...row,
                reason: row.reason + " Order alone exceeds maximum curd boxes."
            };
        }
        if (limits.maxHours && options.serviceMinutes > limits.maxHours * 60) {
            infeasibleRowIds.add(row.rowId);
            return {
                ...row,
                reason: row.reason + " Stop service alone exceeds maximum working hours."
            };
        }
        return row;
    });
    while (result.unassigned.length) {
        const allPending = result.unassigned,
            pending = allPending.filter((row) => !infeasibleRowIds.has(row.rowId)),
            offset = result.trips.length;
        if (!pending.length) break;
        const run = async (batch) => {
            recoveryAttempts++;
            const settings = {
                ...options,
                slotOffset: offset
            };
            const response = await optimize(autoRequest(batch, settings, depot, batch.length));
            return parseAutoResponse(response, batch, settings, depot, batch.length);
        };
        let recovery;
        try {
            recovery = await run(pending);
            recovery.trips.sort((a, b) => a.configurationIndex - b.configurationIndex);
            // Only a dense prefix can be appended without altering verified dates.
            let prefix = getDenseTripPrefix(recovery.trips);
            if (!prefix.length && pending.length > 1) {
                for (const stop of pending) {
                    const single = await run([stop]);
                    if (single.trips.length) {
                        recovery = single;
                        prefix = single.trips;
                        break;
                    }
                }
            }
            if (!prefix.length) {
                const reasons = new Map(recovery.unassigned.map((row) => [row.rowId, row.reason]));
                result.unassigned = allPending.map((row) => ({
                    ...row,
                    reason: [
                        row.reason,
                        reasons.get(row.rowId),
                        "Outstanding-order recovery made no verified progress; no feasibility proof is claimed."
                    ]
                        .filter(Boolean)
                        .join(" ")
                }));
                break;
            }
            const added = new Set();
            for (const trip of prefix) {
                trip.configurationIndex += offset;
                trip.indices = trip.stops.map((stop) => orderIndexByRowId.get(stop.rowId));
                for (const stop of trip.stops) {
                    if (
                        added.has(stop.rowId) ||
                        result.trips.some((t) => t.stops.some((s) => s.rowId === stop.rowId))
                    )
                        throw Error("Recovery duplicated an order.");
                    added.add(stop.rowId);
                }
            }
            result.trips.push(...prefix);
            result.unassigned = allPending.filter((row) => !added.has(row.rowId));
            result.assignedCount += added.size;
            if (!added.size) break;
        } catch (error) {
            result.recoveryWarning =
                "Outstanding-order recovery stopped: " +
                error.message +
                " Previously verified trips retained.";
            result.unassigned = allPending.map((row) => ({
                ...row,
                reason: row.reason + " Recovery could not verify this order: " + error.message
            }));
            break;
        }
    }
    return {
        ...result,
        outstandingRecoveryAttempts: recoveryAttempts
    };
}
async function solveCandidate(rows, options, depot, seedTrip, optimize) {
    const initialBatches = initialAutoBatches(seedTrip, options, depot),
        limits = hardCaps(options);
    const minimumSlotCount = Math.max(
        1,
        limits.maxHours
            ? Math.ceil((rows.length * options.serviceMinutes) / (limits.maxHours * 60))
            : 1,
        limits.maxCurd ? Math.ceil(rows.reduce((n, r) => n + r.curd, 0) / limits.maxCurd) : 1
    );
    let slotCount = Math.min(rows.length, Math.max(minimumSlotCount, initialBatches.length)),
        useInitialBatches = true,
        result,
        bestDenseResult;
    const reasonHistory = new Map();
    const rememberUnassignedReasons = () => {
        for (const row of result.unassigned) {
            if (!reasonHistory.has(row.rowId)) reasonHistory.set(row.rowId, new Set());
            reasonHistory.get(row.rowId).add(row.reason);
        }
    };
    const rememberBestDenseResult = () => {
        if (
            result.trips.every((t, i) => t.configurationIndex === i) &&
            (!bestDenseResult || result.assignedCount > bestDenseResult.assignedCount)
        )
            bestDenseResult = result;
    };
    const tryOptimizationWithVerifiedFallback = async (request) => {
        try {
            return await optimize(request);
        } catch (error) {
            if (!bestDenseResult || !error.isProviderError) throw error;
            return null;
        }
    };
    for (const targetSlots of new Set([slotCount, rows.length])) {
        slotCount = targetSlots;
        const response = await tryOptimizationWithVerifiedFallback(
            autoRequest(rows, options, depot, slotCount, {
                hints: useInitialBatches ? initialBatches : []
            })
        );
        if (!response)
            return {
                ...bestDenseResult,
                recoveryWarning:
                    "Provider failed during slot expansion; only previously verified dense trips retained."
            };
        result = parseAutoResponse(response, rows, options, depot, slotCount);
        rememberUnassignedReasons();
        result.trips.sort((a, b) => a.configurationIndex - b.configurationIndex);
        rememberBestDenseResult();
        if (
            !result.unassigned.length ||
            slotCount === rows.length ||
            (result.assignedCount === 0 && !result.trafficRejectedRoutes)
        )
            break;
        useInitialBatches = false;
    }
    // Unused Google vehicle slots may leave day gaps. Re-optimize against the
    // dense actual schedule; never just relabel a route with another departure.
    let scheduleCompactions = 0;
    result.trips.sort((a, b) => a.configurationIndex - b.configurationIndex);
    while (result.trips.some((trip, index) => trip.configurationIndex !== index)) {
        const previousSlots = slotCount;
        slotCount = result.trips.length;
        if (!slotCount) break;
        if (slotCount >= previousSlots)
            throw Error("Schedule compaction made no progress; stopped without relabeling dates.");
        const compactHints = result.trips
            .sort((a, b) => a.configurationIndex - b.configurationIndex)
            .map((t) => t.indices);
        const response = await tryOptimizationWithVerifiedFallback(
            autoRequest(rows, options, depot, slotCount, {
                hints: compactHints
            })
        );
        if (!response)
            return {
                ...bestDenseResult,
                recoveryWarning:
                    "Provider failed during schedule compaction; only previously verified dense trips retained."
            };
        result = parseAutoResponse(response, rows, options, depot, slotCount);
        scheduleCompactions++;
        result.trips.sort((a, b) => a.configurationIndex - b.configurationIndex);
    }
    result.trips.sort((a, b) => a.configurationIndex - b.configurationIndex);
    rememberBestDenseResult();
    if (bestDenseResult && bestDenseResult.assignedCount > result.assignedCount)
        result = bestDenseResult;
    result.unassigned = result.unassigned.map((row) => ({
        ...row,
        reason: [...new Set([...(reasonHistory.get(row.rowId) ?? []), row.reason])].join(" ")
    }));
    result = await recoverOutstanding(result, rows, options, depot, optimize);
    return {
        ...result,
        initialBatchCount: initialBatches.length,
        scheduleCompactions: scheduleCompactions
    };
}
export async function autoSplitTrips(orders, options, depotInput, optimize) {
    validateAutoLimits(options);
    const depot = coordinates(depotInput);
    if (!depot) throw Error("Invalid configured depot");
    const rows = [],
        invalid = [];
    for (const order of orders) {
        const quantities = FLAVOUR_KEYS.map((key) => Number(order[key] ?? 0));
        const stop = {
            ...order,
            latLng: coordinates(order.latLng),
            curd: Number(order.curd ?? 0),
            icecream: quantities.reduce((n, q) => n + q, 0)
        };
        if (!stop.latLng || ![stop.curd, ...quantities].every((n) => Number.isFinite(n) && n >= 0))
            invalid.push({
                ...stop,
                reason: "Invalid coordinates or quantities; not sent to Google."
            });
        else rows.push(stop);
    }
    rows.sort((a, b) => a.rowId - b.rowId);
    if (!rows.length)
        return {
            trips: [],
            unassigned: invalid,
            eligibleCount: orders.length,
            assignedCount: 0,
            mode: "auto",
            notes: ["No valid orders available."]
        };
    const providerState = {
        calls: 0
    };
    const callGoogle = createCachedOptimizer(optimize, providerState);
    const seedResult = parseAutoResponse(
        await callGoogle(
            autoRequest(rows, options, depot, 1, {
                sequence: true
            })
        ),
        rows,
        options,
        depot,
        1,
        {
            sequence: true
        }
    );
    if (seedResult.unassigned.length || seedResult.trips.length !== 1)
        throw Error(
            "The first Google sequence did not cover every valid order. Planning stopped without estimates."
        );
    const strategy = options.strategy ?? "time",
        planningObjectives = getPlanningObjectives(strategy);
    const comparison = [],
        solutions = new Map();
    let providerStopped = false;
    for (const objective of planningObjectives) {
        if (providerStopped) {
            comparison.push({
                objective,
                status: "unavailable",
                fullCoverage: false,
                reason: "Not attempted after a provider failure; no automatic retry."
            });
            continue;
        }
        try {
            const result = await solveCandidate(
                rows,
                {
                    ...options,
                    objective
                },
                depot,
                seedResult.trips[0],
                callGoogle
            );
            providerStopped = Boolean(providerState.failed);
            const unassigned = [...invalid, ...result.unassigned],
                fullCoverage = unassigned.length === 0 && result.assignedCount === orders.length;
            comparison.push({
                objective,
                status: fullCoverage ? "complete" : "incomplete",
                fullCoverage,
                assignedCount: result.assignedCount,
                orderCount: orders.length,
                tripCount: result.trips.length,
                combinedMeters: result.trips.reduce((n, t) => n + t.totalMeters, 0),
                totalSeconds: result.trips.reduce((n, t) => n + t.totalSeconds, 0)
            });
            solutions.set(objective, {
                ...result,
                unassigned
            });
        } catch (error) {
            if (strategy !== "best") throw error;
            if (error.isProviderError) providerStopped = true;
            comparison.push({
                objective,
                status: "unavailable",
                fullCoverage: false,
                reason: error.message
            });
        }
    }
    comparison.sort(compareVerifiedCandidates);
    const winner = comparison.find((c) => c.status !== "unavailable");
    const result = winner
        ? solutions.get(winner.objective)
        : {
              trips: [],
              unassigned: orders.map((row) => ({
                  ...row,
                  reason: "No candidate produced a verified plan."
              })),
              assignedCount: 0
          };
    const notes = [
        "The first Google loop is a sequencing hint only, never a dispatch or feasibility claim. One shared Google all-orders sequence starts every plan. Joint optimization may move every stop; final road loops are verified against the selected caps.",
        "Trips use actual Asia/Kolkata departures: at most one trip per rider per local day, on consecutive days. Empty slot gaps are compacted only by a fresh Google verification.",
        "Trip count, earlier-trip fullness, mileage and nearby short-final-trip goals are cost preferences, not a global optimum guarantee."
    ];
    if (result.recoveryWarning) notes.push(result.recoveryWarning);
    if (result.trafficRejectedRoutes)
        notes.push(
            "Traffic-infeasible final routes were excluded; their orders remain explicitly unassigned."
        );
    if (strategy === "best")
        notes.push(
            "Best plan ranks these three tested candidates by complete coverage, assigned count, fewest trips, combined verified road distance, then sum of working time. All three hard caps apply to every candidate."
        );
    if (result.trips.length > 1) {
        const last = result.trips.at(-1),
            longest = Math.max(...result.trips.map((t) => t.totalSeconds));
        const radius = (t) =>
            Math.max(...t.stops.map((s) => estimateStraightLineKm(depot, s.latLng)));
        if (
            last.totalSeconds < longest * 0.75 &&
            radius(last) > Math.max(...result.trips.map(radius)) * 0.7
        )
            notes.push(
                "The short final trip still contains a relatively distant stop. The verified schedule retained this trade-off; a nearby-only alternative has not been proven."
            );
    }
    return {
        ...result,
        eligibleCount: orders.length,
        mode: "auto",
        strategy,
        winner: strategy === "best" ? (winner?.objective ?? null) : undefined,
        comparison: strategy === "best" ? comparison : undefined,
        candidates:
            strategy === "best"
                ? comparison.map((c) => ({
                      ...c,
                      ...(solutions.has(c.objective)
                          ? solutions.get(c.objective)
                          : {
                                trips: [],
                                unassigned: orders.map((row) => ({
                                    ...row,
                                    reason: c.reason
                                })),
                                assignedCount: 0
                            }),
                      eligibleCount: orders.length,
                      verificationStatus: solutions.has(c.objective)
                          ? "verified-provider-results"
                          : "unavailable"
                  }))
                : undefined,
        providerCalls: providerState.calls,
        sequenceOrderCount: rows.length,
        riderCount: options.riderCount ?? 1,
        verificationStatus: winner ? "verified-provider-results" : "unavailable",
        notes,
        verificationWarnings: result.unassigned.length
            ? [
                  "Only verified planned trips are shown; unassigned/unavailable orders are not silently estimated."
              ]
            : []
    };
}
