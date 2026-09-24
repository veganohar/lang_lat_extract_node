import { readFile } from "fs/promises";
import { readSheetinSequence } from "../utils/readWriteSheetsUtil.js";
import { recipes } from "../data/recipes.js";
import { metrics } from "../data/metrics.js";
import { roundoffs } from "../data/roundoffs.js";
import {
    ORDER_SHEET,
    ORDER_STATUS_INDEX_FROM_CURD,
    PRICING_SHEET,
    STOCK_SHEET,
    getSheetRange,
    mapSheetRow,
} from "../data/sheetSchema.js";
const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const SALESSHEET_ID = config.salesSheetId;
const CUSTOMERSSHEET_ID = config.customersSheetId;

export async function getFlavours() {
    const [pricingData, stockData, ordersData] = await Promise.all([
        readSheetinSequence(getSheetRange(PRICING_SHEET, { startRow: 3 }), SALESSHEET_ID),
        readSheetinSequence(getSheetRange(STOCK_SHEET, { startRow: 3, endRow: 12 }), SALESSHEET_ID),
        readSheetinSequence(getSheetRange(ORDER_SHEET, {
            fields: ORDER_SHEET.fields.filter(({ key }) => key !== "name" && key !== "phone" && key !== "address" && key !== "mapUrl" && key !== "latLng"),
        }), CUSTOMERSSHEET_ID),
    ]);
    const { flavours, curdOrderedCount } = combineFlavours(
        pricingData.map((row) => mapSheetRow(row, PRICING_SHEET)),
        stockData.map((row) => mapSheetRow(row, STOCK_SHEET)),
        ordersData
    );
    return { flavours, curdOrderedCount };
}

function combineFlavours(pricingData, stockData, ordersData, idStart = 1) {
    const stockMap = Object.fromEntries(stockData.map((stock) => [stock.shortName, stock]));
    const orders = sumOrders(ordersData);
    const flavours = pricingData.map((pricing, index) => {
        const stock = stockMap[pricing.shortName] || {};
        return {
            id: idStart + index,
            name: pricing.name,
            shortName: pricing.shortName,
            prices: {
                "100ml": pricing.sellingPrice100ml,
                "500ml": pricing.sellingPrice500ml,
            },
            stock: {
                "100ml": stock.stock100ml || 0,
                "500ml": (stock.stock500ml || 0) - Number(orders[pricing.shortName] || 0),
            },
        };
    });
    const curdOrderedCount = orders.Curd;
    return { flavours, curdOrderedCount }
}

function sumOrders(data) {
    const headers = data[0]; // first row = keys
    const totals = Object.fromEntries(headers.map(h => [h, 0]));
    if (data.length === 1) {
        // only header row, no orders
        return totals;
    }
    for (let i = 1; i < data.length; i++) {
        if(data[i][ORDER_STATUS_INDEX_FROM_CURD] != 3){
        data[i].forEach((val, colIndex) => {
            totals[headers[colIndex]] += Number(val) || 0;
        });
        }
    }
    return totals;
}


export function getRecipe(flavour, tins) {
    const base = recipes[flavour];
    let result = {};
    for (const key in base) {
        const unit = metrics[key] || "";
        const decimal = roundoffs[key] ?? 2;
        const value = base[key] * tins;
        result[key] = `${value.toFixed(decimal)} ${unit}`;
    }
    return result;

}
