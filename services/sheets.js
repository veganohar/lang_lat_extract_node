import { readFile } from "fs/promises";
import { expandUrlAndGetCoords } from '../utils/coordsUtil.js';
import { writeToSheet, readSheetinSequence, clearData } from "../utils/readWriteSheetsUtil.js";
import { getTwoWheelerDistances } from "../utils/findDistanceUtil.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

// Write Lat and Lng to sheet
export async function writeLatLng(range) {
  const shortURLs = await readSheetinSequence("Sheet1!D2:D", CUSTOMERSSHEET_ID);
  const latLngs = await processUrls(shortURLs);
  await clearData(range,CUSTOMERSSHEET_ID);
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





