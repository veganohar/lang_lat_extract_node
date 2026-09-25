import { readFile } from "fs/promises";
import { sendWhatsAppMessage } from '../utils/whatsAppUtil.js';
import { optimizeRoute, calculateTripSchedule, parseRows, buildWaypoints, buildOrdersMessage, buildSummary } from '../helpers/deliveryPlannerHelper.js';
import { readSheetinRanges, readSheetinSequence, updateSingleColumnRowsWithValues } from "../utils/readWriteSheetsUtil.js";
import { clusterWaypointsPython } from "../helpers/clusterRoutesHelper.js";
import { ORDER_SHEET, getSheetField, getSheetRange, mapSheetRow } from "../data/sheetSchema.js";
import { getAccessToken } from "../utils/googleAuth.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

const DELIVERY_TIME_ZONE = "Asia/Kolkata";
const CURD_CAPACITY_GRAMS = 37000;
const PLAN_SLOTS = [
  { day: "Saturday", start: "07:30", end: "16:30", returnBy: "16:30", maxSeconds: 9 * 60 * 60, status: 4 },
  { day: "Saturday", start: "17:00", end: "21:00", returnBy: "22:00", maxSeconds: 5 * 60 * 60, status: 5 },
  { day: "Sunday", start: "07:30", end: "16:30", returnBy: "16:30", maxSeconds: 9 * 60 * 60, status: 6 },
  { day: "Sunday", start: "17:00", end: "21:00", returnBy: "22:00", maxSeconds: 5 * 60 * 60, status: 7 },
];

function getUpcomingWeekendDates() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DELIVERY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const currentDate = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const localToday = new Date(Date.UTC(Number(currentDate.year), Number(currentDate.month) - 1, Number(currentDate.day)));
  const saturdayOffset = (6 - localToday.getUTCDay() + 7) % 7 || 7;
  const saturday = new Date(localToday);
  saturday.setUTCDate(saturday.getUTCDate() + saturdayOffset);
  const sunday = new Date(saturday);
  sunday.setUTCDate(sunday.getUTCDate() + 1);
  const toDateString = (date) => date.toISOString().slice(0, 10);
  return { Saturday: toDateString(saturday), Sunday: toDateString(sunday) };
}

function zonedTimestamp(date, time) {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function formatLocalTime(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: DELIVERY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function durationInMinutes(duration = "") {
  const seconds = Number.parseFloat(String(duration).match(/[\d.]+/)?.[0] || "0");
  return Math.round(seconds / 60);
}

function mapsUrl(coords) {
  return `${config.allLocationsMapUrl}/${config.baseCoords}${coords.map((coord) => `/${coord}`).join("")}/${config.baseCoords}`;
}

function distanceFromDepotKm(order) {
  const [lat, lng] = String(order.latLng || "").split(",").map(Number);
  const [baseLat, baseLng] = [Number(config.baseLat), Number(config.baseLng)];
  const radians = (value) => (value * Math.PI) / 180;
  const a = Math.sin(radians(lat - baseLat) / 2) ** 2
    + Math.cos(radians(baseLat)) * Math.cos(radians(lat)) * Math.sin(radians(lng - baseLng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function optimizeDeliveryPlan(orders, dates) {
  const accessToken = await getAccessToken();
  const vehicles = PLAN_SLOTS.map((slot, index) => {
    const date = dates[slot.day];
    const shiftStart = zonedTimestamp(date, slot.start);
    const shiftEnd = zonedTimestamp(date, slot.returnBy);
    return {
      label: `${slot.day} ${index % 2 === 0 ? "Morning" : "Evening"}`,
      startLocation: { latitude: Number(config.baseLat), longitude: Number(config.baseLng) },
      endLocation: { latitude: Number(config.baseLat), longitude: Number(config.baseLng) },
      startTimeWindows: [{ startTime: shiftStart, endTime: shiftStart }],
      endTimeWindows: [{ startTime: shiftStart, endTime: shiftEnd }],
      routeDurationLimit: { maxDuration: `${slot.maxSeconds}s` },
      loadLimits: { curd_grams: { maxLoad: String(CURD_CAPACITY_GRAMS) } },
      costPerKilometer: 1,
    };
  });

  const distances = orders.map(distanceFromDepotKm).sort((a, b) => a - b);
  const medianDistance = distances[Math.floor(distances.length / 2)] || 0;
  const shipments = orders.map((order) => {
    const [latitude, longitude] = String(order.latLng || "").split(",").map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`Order ${order.id} (${order.name}) is missing valid map coordinates.`);
    }
    const curdGrams = Math.ceil(Math.max(0, Number(order.curd) || 0) * 1000);
    return {
      label: String(order.id),
      loadDemands: { curd_grams: { amount: String(curdGrams) } },
      // Encourage long depot trips in the morning and nearby drops in the evening.
      costsPerVehicle: PLAN_SLOTS.map((slot, vehicleIndex) => {
        const isFarOrder = distanceFromDepotKm(order) > medianDistance;
        const prefersMorning = isFarOrder;
        const isMorningSlot = vehicleIndex % 2 === 0;
        return prefersMorning === isMorningSlot ? 0 : 25;
      }),
      deliveries: [{
        arrivalLocation: { latitude, longitude },
        timeWindows: ["Saturday", "Sunday"].map((day) => ({
          startTime: zonedTimestamp(dates[day], "07:30"),
          endTime: zonedTimestamp(dates[day], "20:50"),
        })),
      }],
    };
  });

  const body = {
    // Larger constrained plans need more than the API's default fast first solution.
    timeout: "180s",
    searchMode: "CONSUME_ALL_AVAILABLE_TIME",
    considerRoadTraffic: true,
    model: {
      globalStartTime: zonedTimestamp(dates.Saturday, "07:30"),
      globalEndTime: zonedTimestamp(dates.Sunday, "22:00"),
      vehicles,
      shipments,
    },
  };
  const url = config.routeOptimizationUrl.replace("{projectId}", process.env.GOOGLE_PROJECT_ID);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Server-Timeout": "190",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google could not create a feasible delivery plan: ${details}`);
  }
  return response.json();
}

export async function planDeliveries(orderIdsJson) {
  const orderIds = [...new Set(JSON.parse(orderIdsJson).map(Number))].sort((a, b) => a - b);
  if (orderIds.length === 0 || orderIds.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new Error("Select at least one valid order to plan deliveries.");
  }

  const dates = getUpcomingWeekendDates();
  const sheetRows = await readSheetinSequence(getSheetRange(ORDER_SHEET, { startRow: 2 }), CUSTOMERSSHEET_ID);
  const orders = orderIds.map((id) => {
    const row = sheetRows[id - 1];
    if (!row) throw new Error(`Order ${id} no longer exists. Refresh the orders list and try again.`);
    return { id, ...mapSheetRow(row, ORDER_SHEET) };
  });
  const result = await optimizeDeliveryPlan(orders, dates);
  const routes = result.routes || [];
  const getRouteVehicleIndex = (route) => {
    if (route.vehicleIndex !== undefined && Number.isInteger(Number(route.vehicleIndex))) {
      return Number(route.vehicleIndex);
    }
    const labelIndex = PLAN_SLOTS.findIndex((slot, index) =>
      route.vehicleLabel === `${slot.day} ${index % 2 === 0 ? "Morning" : "Evening"}`
    );
    return labelIndex >= 0 ? labelIndex : null;
  };
  const assigned = new Set();
  const plannedSlots = PLAN_SLOTS.map((slot, vehicleIndex) => {
    const route = routes.find((item) => getRouteVehicleIndex(item) === vehicleIndex)
      || (routes.length === PLAN_SLOTS.length && routes[vehicleIndex]);
    const assignedOrders = (route?.visits || [])
      .map((visit) => {
        // Proto JSON can omit default integer values (shipmentIndex 0).
        // The label is set to the sheet order ID so the first shipment remains identifiable.
        const shipmentIndex = visit.shipmentIndex !== undefined
          ? Number(visit.shipmentIndex)
          : orders.findIndex((order) => String(order.id) === String(visit.shipmentLabel));
        if (!Number.isInteger(shipmentIndex) || shipmentIndex < 0) return null;
        const order = orders[shipmentIndex];
        if (!order) return null;
        assigned.add(order.id);
        return { id: order.id, order, startTime: visit.startTime };
      })
      .filter(Boolean);
    const coords = assignedOrders.map(({ order }) => order.latLng).filter(Boolean);
    const startTime = route?.vehicleStartTime || zonedTimestamp(dates[slot.day], slot.start);
    const endTime = route?.vehicleEndTime || "";
    return {
      day: slot.day,
      date: dates[slot.day],
      shift: vehicleIndex % 2 === 0 ? "Morning" : "Evening",
      startTime: formatLocalTime(startTime) || slot.start,
      endTime: formatLocalTime(endTime) || slot.end,
      status: slot.status,
      statusLabel: `Reserved ${slot.status - 3}`,
      routeMinutes: durationInMinutes(route?.metrics?.totalDuration),
      routeKm: Number(((Number(route?.metrics?.travelDistanceMeters) || 0) / 1000).toFixed(1)),
      orderIds: assignedOrders.map(({ id }) => id),
      orderIndexes: assignedOrders.map(({ id }) => id - 1),
      orderEtas: assignedOrders.map(({ startTime }) => formatLocalTime(startTime)),
      routeUrl: coords.length ? mapsUrl(coords) : "",
      curdKg: assignedOrders.reduce((sum, { order }) => sum + (Number(order.curd) || 0), 0),
    };
  });

  const missing = orderIds.filter((id) => !assigned.has(id));
  if (missing.length) {
    const skippedReasons = (result.skippedShipments || [])
      .map((shipment) => {
        return (shipment.reasons || []).map((reason) => reason.code).filter(Boolean);
      })
      .flat();
    const reasonSummary = [...new Set(skippedReasons)].join(", ");
    const slotCounts = plannedSlots
      .map((slot) => `${slot.day} ${slot.shift}: ${slot.orderIds.length} orders / ${slot.curdKg.toFixed(1)} kg curd / ${slot.routeMinutes} min / ${slot.routeKm} km`)
      .join("; ");
    const skippedCurdKg = orders
      .filter((order) => missing.includes(order.id))
      .reduce((sum, order) => sum + (Number(order.curd) || 0), 0);
    throw new Error(`Google assigned ${assigned.size} of ${orderIds.length} orders. Unassigned order IDs: ${missing.join(", ")} (${skippedCurdKg.toFixed(1)} kg curd).${reasonSummary ? ` Google skip reasons: ${reasonSummary}.` : " Google could not identify a single skip reason."} Returned assignments: ${slotCounts}. No statuses were changed.`);
  }

  const statusColumn = getSheetField(ORDER_SHEET, "status").column;
  const rowValues = plannedSlots.flatMap((slot) => slot.orderIds.map((id) => ({ row: id + 1, value: slot.status })));
  await updateSingleColumnRowsWithValues(ORDER_SHEET.name, CUSTOMERSSHEET_ID, statusColumn, rowValues);
  return { dates, slots: plannedSlots };
}

export async function deliveryPlanner(rowIds, stTime, avgDelay) {
  // prepare ranges
  const idsArray = rowIds.split(",");
  const ranges = idsArray.map((id) => getSheetRange(ORDER_SHEET, { startRow: id, endRow: id }));
  // fetch sheet data
  const data = await readSheetinRanges(ranges, CUSTOMERSSHEET_ID);
  // format rows
  const formattedData = parseRows(data, 'deliveryPlanner');
  // prepare waypoints
  const waypoints = buildWaypoints(formattedData);
  // optimize route
  const { optimizedIndexes, optimizedLocationsMapUrl, legs } = await optimizeRoute(waypoints);
  // calculate schedule
  const etas = await calculateTripSchedule(legs, stTime, avgDelay);
  // order data by optimized route
  let orderedData = optimizedIndexes.map(i => formattedData[i]);
  const stops = etas.stops;
  orderedData = orderedData.map((stop, idx) => ({
    ...stop,
    etaStart: stops[idx].etaStart,
    etaEnd: stops[idx].etaEnd,
    distance: stops[idx].distance,
    duration: stops[idx].duration
  }));
  // build WhatsApp message
  const ordersMessage = buildOrdersMessage(orderedData, etas);
  const { summaryText, summaryObject } = buildSummary(etas, orderedData);
  const whatsappMessage = [...ordersMessage, summaryText];
  // await sendWhatsAppMessage(919492901901, whatsappMessage);
  return {
    optimizedLocationsMapUrl,
    whatsappMessage,
    orderedData,
    summary: summaryObject
  };
}


export async function generateClusters(params) {
  try {
    const sortedOrderIds = JSON.parse(params.orderIds).sort((a, b) => a - b)
    const ranges = getSheetRange(ORDER_SHEET, { startRow: 2 });
    const dataFromSheet = await readSheetinSequence(ranges, CUSTOMERSSHEET_ID);
    const sortedDataFromSheet = sortedOrderIds.map((i) => mapSheetRow(dataFromSheet[i - 1], ORDER_SHEET));
    const [waypoints, distances] = sortedDataFromSheet.reduce(
      ([a, b], item) => {
        a.push(item.latLng);
        b.push(item.distance);
        return [a, b];
      },
      [[], []]
    );
   const clustersData = await clusterWaypointsPython(
      {
        depot: config.baseCoords,
        waypoints,
        distances,
        num_clusters: Number(params.numClusters),
        min_per_cluster: Number(params.minPerCluster),
        max_per_cluster: Number(params.maxPerCluster)
      })
    const mappedClusters = clustersData.cluster_ids.map(cluster =>
      cluster.map(index => (sortedOrderIds[index] - 1))
    );
    return { clusters: mappedClusters };

  } catch (err) {
    console.error('Error Generating Clusters:', err);
    throw err;
  }
}

