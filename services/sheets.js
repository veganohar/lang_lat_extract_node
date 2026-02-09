import { readFile } from "fs/promises";
import { expandUrlAndGetCoords } from '../utils/coordsUtil.js';
import { writeToSheet, readSheetinSequence, clearData } from "../utils/readWriteSheetsUtil.js";
import { getTwoWheelerDistances } from "../utils/findDistanceUtil.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;
const SALESSHEET_ID = config.salesSheetId;
// Write Lat and Lng to sheet
export async function writeLatLng(range) {
  const shortURLs = await readSheetinSequence("Sheet1!D2:D", CUSTOMERSSHEET_ID);
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
  const distances = distancesData.map(item => item.distanceMeters);
  const writeRange = "Sheet1!F2:F";
  await clearData(writeRange, CUSTOMERSSHEET_ID);
  return await writeToSheet(writeRange, distances, CUSTOMERSSHEET_ID);
}

export async function getPrices() {
  const data = await readSheetinSequence("Pricing!A3:H", SALESSHEET_ID);
  const prices = data.map((item, i) => ({
    id: i + 1,
    name: item[0],
    shortName: item[1],
    sizes: {
      "100ml": { mrp: +item[2], sellingPrice: +item[5] },
      "500ml": { mrp: +item[3], sellingPrice: +item[6] },
      "4L": { mrp: +item[4], sellingPrice: +item[7] }
    }
  }));
  return prices;
}



