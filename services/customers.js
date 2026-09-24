import { readFile } from "fs/promises";
import { writeToSheet, readSheetinSequence, deleteRow, updateRow } from "../utils/readWriteSheetsUtil.js";
import { getLatLng } from "./coords.js";
import { getTwoWheelerDistances } from "../utils/findDistanceUtil.js";
import {
    CUSTOMER_SHEET,
    ORDER_SHEET,
    getSheetRange,
    mapSheetRow,
    toSheetRow,
} from "../data/sheetSchema.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;

export async function getCustomers(range) {
    const data = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
    const customersData = data.map((row, index) => ({ id: index + 1, ...mapSheetRow(row, CUSTOMER_SHEET) }));
    return customersData;
}

export async function customerListToMsg() {
    const cList = await readSheetinSequence(getSheetRange(CUSTOMER_SHEET, { startRow: 2 }), CUSTOMERSSHEET_ID);
    const oList = await readSheetinSequence(getSheetRange(ORDER_SHEET, { startRow: 2 }), CUSTOMERSSHEET_ID);
    const makeKey = ({ name = "", phone = "" }) => `${name.trim().toLowerCase()}|${phone.trim()}`;
    const customers = cList.map((row) => mapSheetRow(row, CUSTOMER_SHEET));
    const orderKeys = new Set(oList.map((row) => makeKey(mapSheetRow(row, ORDER_SHEET))));
    const data = customers.filter((customer) => !orderKeys.has(makeKey(customer)))
        .filter((customer, index, list) => list.findIndex((item) => makeKey(item) === makeKey(customer)) === index)
        .map((customer, index) => ({ id: index + 1, ...customer }));
    return data;
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
    const range = getSheetRange(CUSTOMER_SHEET, { startRow: rowNumber, endRow: rowNumber });
    const response = await updateRow(CUSTOMERSSHEET_ID, range, custData);
    return response;
}

async function prepareCustomerData(cData) {
    const coordsData = await getLatLng(cData.mapUrl);
    const distancesData = await getTwoWheelerDistances([coordsData.coords]);
    const distanceMeters = distancesData[0].distanceMeters;
    const mergedData = { ...cData, ...coordsData, distanceMeters };
    const custData = toSheetRow({
        ...mergedData,
        latLng: mergedData.coords,
        distance: mergedData.distanceMeters,
    }, CUSTOMER_SHEET);
    return custData;
}

