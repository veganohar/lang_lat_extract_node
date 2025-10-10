import { readFile } from "fs/promises";
import { sendWhatsAppMessage } from '../utils/whatsAppUtil.js';
import { optimizeRoute, calculateTripSchedule, parseRows, buildWaypoints, buildOrdersMessage, buildSummary } from '../helpers/deliveryPlannerHelper.js';
import { readSheetinRanges, readSheetinSequence } from "../utils/readWriteSheetsUtil.js";
import { optimizeDeliveries } from "../helpers/distanceMatrixHelper.js";
import { clusterWaypointsPython } from "../helpers/clusterRoutesHelper.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

export async function deliveryPlanner(rowIds, stTime, avgDelay) {
  // prepare ranges
  const idsArray = rowIds.split(",");
  const ranges = idsArray.map(id => `Orders!A${id}:R${id}`);
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
    summary: summaryObject,
    data
  };
}


export async function generateClusters(params) {
  try {
    let ranges = `Orders!A2:R`
    const dataFromSheet = await readSheetinSequence(ranges, CUSTOMERSSHEET_ID);
    // const formattedData = parseRows(dataFromSheet, 'OptiPath');
    const [waypoints, distances] = dataFromSheet.reduce(
      ([a, b], item) => {
        a.push(item[4]);
        b.push(Number(item[17]));
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
    return {clusters:clustersData.cluster_ids};
  } catch (err) {
    console.error('Error Generating Clusters:', err);
    throw err;
  }
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