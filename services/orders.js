import { readFile } from "fs/promises";
import { writeToSheet, readSheetinSequence, deleteRow, deleteRows, updateRow, updateSingleColumnMultipleRows } from "../utils/readWriteSheetsUtil.js";
import { getCustomers } from "./customers.js";
import {
    FLAVOUR_KEYS,
    ORDER_FIELDS,
    ORDER_LAST_COLUMN,
    ORDER_PAYMENT_COLUMN,
    ORDER_STATUS_COLUMN,
} from "../data/flavourKeys.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;
export async function getOrders(range) {
    const data = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
    const numericFields = new Set(["curd", ...FLAVOUR_KEYS, "amount", "distance", "payment", "status"]);
    const ordersData = data.map((row, index) => ({
        id: index + 1,
        ...Object.fromEntries(
            ORDER_FIELDS.map((field, fieldIndex) => [
                field,
                numericFields.has(field) ? Number(row[fieldIndex]) || 0 : row[fieldIndex],
            ])
        ),
    }));
    return ordersData;
}

export async function newOrder(range, oData) {
    const ordData = ORDER_FIELDS.map((key) => oData[key]);
    const response = await writeToSheet(range, [ordData], CUSTOMERSSHEET_ID);
    return response;
}

export async function updateOrder(oData, rowNumber) {
    const ordData = ORDER_FIELDS.map((key) => oData[key]);
    const range = `Orders!A${rowNumber}:${ORDER_LAST_COLUMN}${rowNumber}`
    const response = await updateRow(CUSTOMERSSHEET_ID, range, ordData);
    return response;
}

export async function createSubscriptionOrders() {
    const readRange = "Sheet1!A2:H";
    const cust_data = await getCustomers(readRange);
    const subscriptionOrders = cust_data.reduce((acc, obj) => {
        const sub = Number(obj.subscription);

        if (sub > 0) {
            acc.push([
                obj.name,
                obj.phone,
                obj.address,
                obj.mapUrl,
                obj.latLng,
                sub,                 // curd
                ...FLAVOUR_KEYS.map(() => 0), // ice creams
                sub * 130,           // amount
                "",                  // comments
                obj.distance,
                0,                   // payment
                1                    // status
            ]);
        }
        return acc;
    }, []);
    const writeRange = `Orders!A2:${ORDER_LAST_COLUMN}`;
    const response = await writeToSheet(
        writeRange,
        subscriptionOrders,
        CUSTOMERSSHEET_ID
    );

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

export async function updateOrderStatus(body) {
    const column = body.statusType == "payment" ? ORDER_PAYMENT_COLUMN : ORDER_STATUS_COLUMN;
    const rowIds = body.rowIds;
    const statusValue = body.statusValue;

    // const rowValueMap = rowIds.map(row => ({
    //     row,
    //     value:statusValue
    // }));
    const response = await updateSingleColumnMultipleRows("Orders",CUSTOMERSSHEET_ID, column, rowIds, statusValue);
    return response;
}

