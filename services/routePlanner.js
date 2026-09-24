import { readFile } from "fs/promises";
import { sendWhatsAppMessage } from '../utils/whatsAppUtil.js';
import { optimizeRoute, calculateTripSchedule, parseRows, buildWaypoints, buildOrdersMessage, buildSummary } from '../helpers/deliveryPlannerHelper.js';
import { readSheetinRanges, readSheetinSequence } from "../utils/readWriteSheetsUtil.js";
import { clusterWaypointsPython } from "../helpers/clusterRoutesHelper.js";
import { ORDER_SHEET, getSheetRange, mapSheetRow } from "../data/sheetSchema.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

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

