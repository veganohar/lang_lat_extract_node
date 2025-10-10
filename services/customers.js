import { readFile } from "fs/promises";
import { writeToSheet, readSheetinSequence, deleteRow, updateRow } from "../utils/readWriteSheetsUtil.js";
import { getLatLng } from "./coords.js";
import { getTwoWheelerDistances } from "../utils/findDistanceUtil.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

export async function getCustomers(range) {
    const data = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
    const customersData = data.map(([name, phone, address, mapUrl, latLng, distance], index) => (
        { id: index + 1, name, phone, address, mapUrl, latLng, distance: Number(distance) }
    ));
    return customersData;
}

export async function createCustomer(range, cData) {
    const custData = await prepareCustomerData(cData);
    const response = await writeToSheet(range, [custData], CUSTOMERSSHEET_ID);
    return response;
}

export async function deleteCustomer(rowNumber) {
    const response = await deleteRow(CUSTOMERSSHEET_ID, 0, rowNumber);
    return response;
}

export async function updateCustomer(cData, rowNumber) {
    const custData = await prepareCustomerData(cData);
    const range = `Sheet1!A${rowNumber}:E${rowNumber}`
    const response = await updateRow(CUSTOMERSSHEET_ID, range, custData);
    return response;
}

async function prepareCustomerData(cData) {
    const coordsData = await getLatLng(cData.mapUrl);
    const distancesData = await getTwoWheelerDistances([coordsData.coords]);
    const distanceMeters = distancesData[0].distanceMeters;
    const mergedData = { ...cData, ...coordsData, distanceMeters };
    const keys = ["name", "phone", "address", "mapUrl", "coords", "distanceMeters"];
    const custData = keys.map(key => mergedData[key]);
    return custData;
}

