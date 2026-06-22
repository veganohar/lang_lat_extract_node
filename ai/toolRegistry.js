const registry = new Map();

export function registerTool(tool) {

    if (!tool.name) {
        throw new Error("Tool name is required.");
    }

    registry.set(tool.name, tool);

}

export function getToolSchemas() {

    return [...registry.values()].map(tool => ({

        type: "function",

        name: tool.name,

        description: tool.description,

        parameters: tool.inputSchema

    }));

}

export function getTool(name) {

    return registry.get(name);

}