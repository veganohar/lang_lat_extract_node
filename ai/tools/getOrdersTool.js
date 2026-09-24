import { getOrders } from "../../services/orders.js";
import { ORDER_SHEET, getSheetRange } from "../../data/sheetSchema.js";

export default {

    name: "getOrders",

    description: "Returns all orders.",

    inputSchema: {

        type: "object",

        properties: {},

        required: []

    },

    handler: async () => {

        const orders = await getOrders(getSheetRange(ORDER_SHEET, { startRow: 2 }));

        return orders;

    }

};
