import { readFile } from "fs/promises";
import { writeToSheet, readSheetinSequence, deleteRow, deleteRows, updateRow, updateSingleColumnMultipleRows } from "../utils/readWriteSheetsUtil.js";
import { getCustomers } from "./customers.js";
import { FLAVOUR_KEYS } from "../data/flavourKeys.js";
import { PRODUCT_PRICES } from "../data/productPrices.js";
import {
    CUSTOMER_SHEET,
    ORDER_SHEET,
    getSheetField,
    mapSheetRow,
    toSheetRow,
    getSheetRange,
} from "../data/sheetSchema.js";

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const CUSTOMERSSHEET_ID = config.customersSheetId;
export async function getOrders(range) {
    const data = await readSheetinSequence(range, CUSTOMERSSHEET_ID);
    const ordersData = data.map((row, index) => ({
        id: index + 1,
        ...mapSheetRow(row, ORDER_SHEET),
    }));
    return ordersData;
}

export async function newOrder(range, oData) {
    const ordData = toSheetRow(oData, ORDER_SHEET);
    const response = await writeToSheet(range, [ordData], CUSTOMERSSHEET_ID);
    return response;
}

export async function updateOrder(oData, rowNumber) {
    const ordData = toSheetRow(oData, ORDER_SHEET);
    const range = getSheetRange(ORDER_SHEET, { startRow: rowNumber, endRow: rowNumber });
    const response = await updateRow(CUSTOMERSSHEET_ID, range, ordData);
    return response;
}

export async function createSubscriptionOrders() {
    const readRange = getSheetRange(CUSTOMER_SHEET, { startRow: 2 });
    const cust_data = await getCustomers(readRange);
    const subscriptionOrders = cust_data.reduce((acc, obj) => {
        const sub = Number(obj.subscription);

        if (sub > 0) {
            acc.push(toSheetRow({
                name: obj.name,
                phone: obj.phone,
                address: obj.address,
                mapUrl: obj.mapUrl,
                latLng: obj.latLng,
                curd: sub,
                cheese: 0,
                butter: 0,
                ...Object.fromEntries(FLAVOUR_KEYS.map((key) => [key, 0])),
                amount: sub * PRODUCT_PRICES.curd,
                comments: "",
                distance: obj.distance,
                payment: 0,
                status: 1,
            }, ORDER_SHEET));
        }
        return acc;
    }, []);
    const writeRange = getSheetRange(ORDER_SHEET, { startRow: 2 });
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
    const column = body.statusType == "payment"
        ? getSheetField(ORDER_SHEET, "payment").column
        : getSheetField(ORDER_SHEET, "status").column;
    const rowIds = body.rowIds;
    const statusValue = body.statusValue;

    // const rowValueMap = rowIds.map(row => ({
    //     row,
    //     value:statusValue
    // }));
    const response = await updateSingleColumnMultipleRows("Orders",CUSTOMERSSHEET_ID, column, rowIds, statusValue);
    return response;
}

