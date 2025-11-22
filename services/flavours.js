import { readFile } from "fs/promises";
import { readSheetinSequence } from "../utils/readWriteSheetsUtil.js";
import { recipes } from "../data/recipes.js";
import { metrics } from "../data/metrics.js";
import { roundoffs } from "../data/roundoffs.js";
const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
const SALESSHEET_ID = config.salesSheetId;
const CUSTOMERSSHEET_ID = config.customersSheetId;

export async function getFlavours() {
    const [pricingData, stockData, ordersData] = await Promise.all([
        readSheetinSequence("Pricing!A3:H", SALESSHEET_ID),
        readSheetinSequence("Stock!A3:H11", SALESSHEET_ID),
        readSheetinSequence("Orders!F:O", CUSTOMERSSHEET_ID),
    ]);
    const { flavours, curdOrderedCount } = combineFlavours(pricingData, stockData, ordersData);
    return { flavours, curdOrderedCount };
}

function combineFlavours(pricingData, stockData, ordersData, idStart = 1) {
    const stockMap = Object.fromEntries(stockData.map(a => [a[0], a.slice(1).map(Number)]));
    const orders = sumOrders(ordersData);
    const flavours = pricingData.map((pData, index) => {
        const shortName = pData[1];
        return {
            id: idStart + index,
            name: pData[0],
            shortName,
            prices: {
                "100ml": Number(pData[5]),
                "500ml": Number(pData[6])
            },
            stock: {
                "100ml": Number(stockMap[shortName][1]),
                "500ml": Number(stockMap[shortName][2]) - Number(orders[shortName])
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
        data[i].forEach((val, colIndex) => {
            totals[headers[colIndex]] += Number(val) || 0;
        });
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