import { readFile } from "fs/promises";
import { writeToSheet, readSheetinSequence, deleteRow, deleteRows, updateRow } from "../utils/readWriteSheetsUtil.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;
export async function getOrders(range) {
    const data = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
    const ordersData = data.map(([name, phone, address, mapUrl, latLng, curd, cc, ce, eb, em, ev, gc, lc, mc, ss, amount, comments,distance,payment,status], index) => (
        { id: index + 1, name, phone, address, mapUrl, latLng, curd: +curd || 0, cc: +cc || 0, ce: +ce || 0, eb: +eb || 0, em: +em || 0, ev: +ev || 0, gc: +gc || 0, lc: +lc || 0, mc: +mc || 0, ss: +ss || 0, amount: +amount || 0, comments,distance:Number(distance), payment:Number(payment),status:Number(status) }
    ));
    return ordersData;
}

export async function newOrder(range, oData) {
    const keys = ["name", "phone", "address", "mapUrl", "latLng", "curd", "cc", "ce", "eb", "em", "ev", "gc", "lc", "mc", "ss", "amount", "comments", "distance","payment","status"]
    const ordData = [];
    for (let key of keys) {
        ordData.push(oData[key]);
    }
    const response = await writeToSheet(range, [ordData], CUSTOMERSSHEET_ID);
    return response;
}

export async function updateOrder(oData, rowNumber) {
    const keys = ["name", "phone", "address", "mapUrl", "latLng", "curd", "cc", "ce", "eb", "em", "ev", "gc", "lc", "mc", "ss", "amount", "comments", "distance","payment","status"]
    const ordData = [];
    for (let key of keys) {
        ordData.push(oData[key]);
    }
    const range = `Orders!A${rowNumber}:T${rowNumber}`
    const response = await updateRow(CUSTOMERSSHEET_ID, range, ordData);
    return response;
}

export async function deleteOrder(rowNumber) {
    const response = await deleteRow(CUSTOMERSSHEET_ID, config.ordersSheetGid, rowNumber);
    return response;
}

export async function bulkDeleteOrders(rowNumbers) {
    const rowNumbersArray = rowNumbers.split(",").map(Number);
    const sortedRows = [...rowNumbersArray].sort((a, b) => b - a);
    const response = await deleteRows(CUSTOMERSSHEET_ID, config.ordersSheetGid, sortedRows);
    return response;
}

