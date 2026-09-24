import { getCustomers } from "../../services/customers.js";

export default {

    name: "getCustomers",

    description: "Returns all customers.",

    inputSchema: {

        type: "object",

        properties: {},

        required: []

    },

    handler: async () => {

        const customers = await getCustomers("Sheet1!A2:H");

        return customers;

    }

};