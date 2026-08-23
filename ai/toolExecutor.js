import { getTool } from "./toolRegistry.js";

export async function executeTool(name, args) {

    const tool = getTool(name);

    if (!tool) {

        return {

            success: false,

            error: `Tool '${name}' not found.`

        };

    }

    try {

        const result = await tool.handler(args);

        return {

            success: true,

            data: result

        };

    }

    catch (error) {

        console.error(error);

        return {

            success: false,

            error: error.message

        };

    }

}