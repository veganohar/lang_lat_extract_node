import { readFile } from "fs/promises";
import { expandUrlAndGetCoords } from '../utils/coordsUtil.js';
import { writeToSheet, readSheetinSequence, clearData } from "../utils/readWriteSheetsUtil.js";
import { getTwoWheelerDistances } from "../utils/findDistanceUtil.js";
import { CUSTOMER_SHEET, PRICING_SHEET, getSheetField, getSheetRange, mapSheetRow } from "../data/sheetSchema.js";
import { PRODUCT_CATALOG } from "../data/productPrices.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;
const SALESSHEET_ID = config.salesSheetId;
// Write Lat and Lng to sheet
export async function writeLatLng(range) {
  const shortURLs = await readSheetinSequence(getSheetRange(CUSTOMER_SHEET, {
    startRow: 2,
    fields: [getSheetField(CUSTOMER_SHEET, "mapUrl")],
  }), CUSTOMERSSHEET_ID);
  const latLngs = await processUrls(shortURLs);
  await clearData(range, CUSTOMERSSHEET_ID);
  return await writeToSheet(range, latLngs, CUSTOMERSSHEET_ID);
}

async function processUrls(urls) {
  const results = await Promise.all(
    urls.map(async (url) => {
      const lat_lngs = await expandUrlAndGetCoords(url[0]);
      return [lat_lngs.coords]; // { coords: "lat,lng" } or { error: "..." }
    })
  );
  return results;
}

export async function readSheet(range) {
  const latLngArra = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
  const output = latLngArra.map(([coord]) => {
    const [lat, lng] = coord.split(",").map(Number);
    return {
      location: {
        latLng: {
          latitude: lat,
          longitude: lng,
        },
      },
    };
  });
  return output;
}


export async function synchDistances(range) {
  const data = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
  const coords = data.map(item => item[0]);
  const distancesData = await getTwoWheelerDistances(coords);
  const distances = distancesData.map(item => [item.distanceMeters]);
  const writeRange = getSheetRange(CUSTOMER_SHEET, {
    startRow: 2,
    fields: [getSheetField(CUSTOMER_SHEET, "distance")],
  });
  await clearData(writeRange, CUSTOMERSSHEET_ID);
  return await writeToSheet(writeRange, distances, CUSTOMERSSHEET_ID);
}

export async function getPrices() {
  const data = await readSheetinSequence(getSheetRange(PRICING_SHEET, { startRow: 3 }), SALESSHEET_ID);
  const prices = data.map((row, i) => {
    const pricing = mapSheetRow(row, PRICING_SHEET);
    return {
    id: i + 1,
    name: pricing.name,
    shortName: pricing.shortName,
    sizes: {
      "100ml": { mrp: pricing.mrp100ml, sellingPrice: pricing.sellingPrice100ml },
      "500ml": { mrp: pricing.mrp500ml, sellingPrice: pricing.sellingPrice500ml },
      "4L": { mrp: pricing.mrp4L, sellingPrice: pricing.sellingPrice4L },
    }
  };
  });
  return [...PRODUCT_CATALOG, ...prices];
}



