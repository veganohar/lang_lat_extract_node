import { FLAVOUR_KEYS } from "./flavourKeys.js";

const toSpreadsheetColumn = (columnNumber) => {
  let column = "";
  let value = columnNumber;

  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }

  return column;
};

const toColumnNumber = (column) =>
  [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);

const createSheetSchema = (name, fields) => Object.freeze({
  name,
  fields: Object.freeze(fields),
});

// Update this mapping when a Google Sheet column is renamed, moved, or added.
// `key` is the application field; `header` documents the expected sheet header.
export const CUSTOMER_SHEET = createSheetSchema("Sheet1", [
  { key: "name", header: "Name", column: "A" },
  { key: "phone", header: "Phone", column: "B" },
  { key: "address", header: "Address", column: "C" },
  { key: "mapUrl", header: "Location/Map", column: "D" },
  { key: "latLng", header: "Lat,Lng", column: "E" },
  { key: "distance", header: "Distance(Mts)", column: "F", type: "number" },
  { key: "comments", header: "Comments", column: "G" },
  { key: "subscription", header: "subscription", column: "H", type: "number" },
]);

const firstOrderFieldAfterFlavours = 7 + FLAVOUR_KEYS.length;

export const ORDER_SHEET = createSheetSchema("Orders", [
  { key: "name", header: "Name", column: "A" },
  { key: "phone", header: "Mobile", column: "B" },
  { key: "address", header: "Address", column: "C" },
  { key: "mapUrl", header: "Location/Map", column: "D" },
  { key: "latLng", header: "Lat,Lng", column: "E" },
  { key: "curd", header: "Curd", column: "F", type: "number" },
  ...FLAVOUR_KEYS.map((key, index) => ({
    key,
    header: key.toUpperCase(),
    column: toSpreadsheetColumn(7 + index),
    type: "number",
  })),
  { key: "amount", header: "Amount", column: toSpreadsheetColumn(firstOrderFieldAfterFlavours), type: "number" },
  { key: "comments", header: "Comments", column: toSpreadsheetColumn(firstOrderFieldAfterFlavours + 1) },
  { key: "distance", header: "Distance", column: toSpreadsheetColumn(firstOrderFieldAfterFlavours + 2), type: "number" },
  { key: "payment", header: "Payment Status", column: toSpreadsheetColumn(firstOrderFieldAfterFlavours + 3), type: "number" },
  { key: "status", header: "Order Status", column: toSpreadsheetColumn(firstOrderFieldAfterFlavours + 4), type: "number" },
]);

export const PRICING_SHEET = createSheetSchema("Pricing", [
  { key: "name", header: "Flavour", column: "A" },
  { key: "shortName", header: "Short Form", column: "B" },
  { key: "mrp100ml", header: "MRP 100ml", column: "C", type: "number" },
  { key: "mrp500ml", header: "MRP 500ml", column: "D", type: "number" },
  { key: "mrp4L", header: "MRP 4L", column: "E", type: "number" },
  { key: "sellingPrice100ml", header: "Selling Price 100ml", column: "F", type: "number" },
  { key: "sellingPrice500ml", header: "Selling Price 500ml", column: "G", type: "number" },
  { key: "sellingPrice4L", header: "Selling Price 4L", column: "H", type: "number" },
]);

// The main Stock Report table only. Its data rows are 3–11; other tables lower
// on the tab are separate reports and intentionally excluded. The 50 ML column
// is sometimes hidden in Google Sheets, but remains column B in the data.
export const STOCK_SHEET = createSheetSchema("Stock", [
  { key: "shortName", header: "Flavour", column: "A" },
  { key: "stock50ml", header: "50 ML", column: "B", type: "number" },
  { key: "stock100ml", header: "100 ML", column: "C", type: "number" },
  { key: "stock500ml", header: "500 ML", column: "D", type: "number" },
  { key: "stock4L", header: "4 L", column: "E", type: "number" },
  { key: "stockLitres", header: "In Lts", column: "F", type: "number" },
]);

export const getSheetField = (sheet, key) => {
  const field = sheet.fields.find((item) => item.key === key);
  if (!field) throw new Error(`Unknown ${sheet.name} field: ${key}`);
  return field;
};

export const getSheetRange = (sheet, { startRow = 1, endRow, fields = sheet.fields } = {}) => {
  const columns = fields.map(({ column }) => toColumnNumber(column));
  const startColumn = toSpreadsheetColumn(Math.min(...columns));
  const endColumn = toSpreadsheetColumn(Math.max(...columns));
  return `${sheet.name}!${startColumn}${startRow}:${endColumn}${endRow ?? ""}`;
};

export const mapSheetRow = (row, sheet) => {
  const firstColumn = Math.min(...sheet.fields.map(({ column }) => toColumnNumber(column)));
  return Object.fromEntries(
    sheet.fields.map(({ key, column, type }) => {
      const value = row[toColumnNumber(column) - firstColumn];
      return [key, type === "number" ? Number(value) || 0 : value];
    })
  );
};

export const toSheetRow = (data, sheet) => {
  const firstColumn = Math.min(...sheet.fields.map(({ column }) => toColumnNumber(column)));
  const lastColumn = Math.max(...sheet.fields.map(({ column }) => toColumnNumber(column)));
  const row = Array(lastColumn - firstColumn + 1).fill("");
  sheet.fields.forEach(({ key, column }) => {
    row[toColumnNumber(column) - firstColumn] = data[key] ?? "";
  });
  return row;
};

