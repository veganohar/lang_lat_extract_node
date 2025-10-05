import { readFile } from "fs/promises";
import { sendWhatsAppMessage } from '../utils/whatsAppUtil.js';
import { optimizeRoute, calculateTripSchedule, parseRows, buildWaypoints, buildOrdersMessage, buildSummary } from '../helpers/deliveryPlannerHelper.js'
import { clusterDeliveriesByDistanceFromBase } from '../helpers/clusterHelper.js';
import { optimizedRoute, routeDistance } from '../helpers/tspHelper.js';
import { improveClusters } from '../helpers/clusterImproverHelper.js';
import { clearDistanceCache } from '../utils/distanceUtils.js';
import { readSheetinRanges, readSheetinSequence } from "../utils/readWriteSheetsUtil.js";
import { optimizeDeliveries } from "../helpers/distanceMatrixHelper.js"
const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

export async function deliveryPlanner(rowIds, stTime, avgDelay) {
  // prepare ranges
  const idsArray = rowIds.split(",");
  const ranges = idsArray.map(id => `Orders!A${id}:Q${id}`);
  // fetch sheet data
  const data = await readSheetinRanges(ranges, CUSTOMERSSHEET_ID);
  // format rows
  const formattedData = parseRows(data);
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


export async function planRoutes() {
  clearDistanceCache(); // start fresh if needed
  const deliveryList = await readSheetinSequence("Orders!A2:Q", CUSTOMERSSHEET_ID);
  const deliveries = deliveryList.filter(row => row[4]) // only rows with coords
    .map((row, index) => {
      const [lat, lng] = row[4].split(",").map(Number);
      return {
        id: index + 1, // optional, remove if not needed
        lat,
        lng
      };
    });
  // 1) initial clusters (by distance-from-base batching)
  let clusters = clusterDeliveriesByDistanceFromBase(deliveries, { lat: 17.4575596, lng: 78.3052356 }, 18);
  // 2) local improvement across clusters (relocate/swap)
  clusters = improveClusters(clusters, { lat: 17.4575596, lng: 78.3052356 }, 18);
  // 3) finalize: compute optimized route for each improved cluster
  const trips = clusters.map((cluster) => {
    const route = optimizedRoute([{ lat: 17.4575596, lng: 78.3052356 }, ...cluster, { lat: 17.4575596, lng: 78.3052356 }]);
    const path = route.map(p => `${p.lat},${p.lng}`).join("/");
    const optimizedLocationsMapUrl = config.allLocationsMapUrl + '/' + path;
    // config.allLocationsMapUrl
    const dist = routeDistance(route);
    return { route, distanceKm: dist, deliveries: cluster.map(d => d.id), optimizedLocationsMapUrl };
  });
  const totalKm = trips.reduce((s, t) => s + t.distanceKm, 0);
  console.log(`Planned ${trips.length} trips — total distance ${totalKm.toFixed(2)} km`);
  return trips;
}


export async function getOptimizedTrips() {
  try {
    let ranges = `Sheet1!E2:E101`
    let locations = await readSheetinRanges(ranges, CUSTOMERSSHEET_ID)
    let latLngs = locations[0].values.map((item) => item[0].split(","));
    for (let i = latLngs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [latLngs[i], latLngs[j]] = [latLngs[j], latLngs[i]];
    }
    latLngs.unshift(config.baseCoords.split(","));
    const result = await optimizeDeliveries(latLngs, 5);
    return result; // { trips, tripLinks }
  } catch (err) {
    console.error('Error optimizing deliveries:', err);
    throw err;
  }
}