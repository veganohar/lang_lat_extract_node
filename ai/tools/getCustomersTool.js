import { getCustomers } from "../../services/customers.js";
import { CUSTOMER_SHEET, getSheetRange } from "../../data/sheetSchema.js";

export default {

    name: "getCustomers",

    description: "Returns all customers.",

    inputSchema: {

        type: "object",

        properties: {},

        required: []

    },

    handler: async () => {

        const customers = await getCustomers(getSheetRange(CUSTOMER_SHEET, { startRow: 2 }));

        return customers;

    }

};