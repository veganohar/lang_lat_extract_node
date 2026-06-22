import { getOrders } from "../../services/orders.js";

export default {

    name: "getOrders",

    description: "Returns all orders.",

    inputSchema: {

        type: "object",

        properties: {},

        required: []

    },

    handler: async () => {

        const orders = await getOrders("Orders!A2:T");

        return orders;

    }

};