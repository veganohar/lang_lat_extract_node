import { FLAVOUR_KEYS } from "./flavourKeys.js";
import { ORDER_SHEET, mapSheetRow } from "./sheetSchema.js";

export const STOCK_ORDER_SHEET = {
    ...ORDER_SHEET,
    fields: ORDER_SHEET.fields.filter(({ key }) =>
        !["name", "phone", "address", "mapUrl", "latLng"].includes(key)),
};

export function sumStockOrders(rows) {
    const keys = ["curd", "cheese", "butter", ...FLAVOUR_KEYS];
    const totals = Object.fromEntries(keys.map((key) => [key, 0]));
    for (const row of rows) {
        const order = mapSheetRow(row, STOCK_ORDER_SHEET);
        if (order.status === 3) continue;
        for (const key of keys) totals[key] += order[key];
    }
    return totals;
}
