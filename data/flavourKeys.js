export const FLAVOUR_KEYS = Object.freeze([
  "cc", "ce", "eb", "em", "ev", "gc", "lc", "mc", "ss",
]);

export const ORDER_FIELDS = Object.freeze([
  "name", "phone", "address", "mapUrl", "latLng", "curd",
  ...FLAVOUR_KEYS,
  "amount", "comments", "distance", "payment", "status",
]);

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

export const ORDER_LAST_COLUMN = toSpreadsheetColumn(ORDER_FIELDS.length);
export const ORDER_STATUS_COLUMN = toSpreadsheetColumn(
  ORDER_FIELDS.indexOf("status") + 1
);
export const ORDER_PAYMENT_COLUMN = toSpreadsheetColumn(
  ORDER_FIELDS.indexOf("payment") + 1
);
export const ORDER_STATUS_INDEX_FROM_CURD =
  ORDER_FIELDS.indexOf("status") - ORDER_FIELDS.indexOf("curd");
