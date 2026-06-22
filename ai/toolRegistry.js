import getOrdersTool from "./tools/getOrdersTool.js";

const registry = new Map();

registerTool(getOrdersTool);

export function registerTool(tool) {

    registry.set(tool.name, tool);

}

export function getTool(name) {

    return registry.get(name);

}

export function getToolSchemas() {

    return [...registry.values()].map(tool => ({

        type: "function",

        name: tool.name,

        description: tool.description,

        parameters: tool.inputSchema

    }));

}