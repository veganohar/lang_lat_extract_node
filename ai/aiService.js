import OpenAI from "openai";

import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { getToolSchemas } from "./toolRegistry.js";
import { executeTool } from "./toolExecutor.js";

import {

    logUser,
    logTool,
    logToolResult,
    logFinal

} from "./logger.js";

const client = new OpenAI({

    apiKey: process.env.OPENAI_API_KEY

});

export async function processMessage(message) {

    logUser(message);

    const input = [

        {

            role: "system",
            content: SYSTEM_PROMPT

        },

        {

            role: "user",
            content: message

        }

    ];

    while (true) {

        const response = await client.responses.create({

            model: "gpt-5-mini",

            input,

            tools: getToolSchemas()

        });

        const toolCall = response.output.find(

            item => item.type === "function_call"

        );

        if (!toolCall) {

            logFinal(response.output_text);

            return response.output_text;

        }

        const args = JSON.parse(toolCall.arguments || "{}");

        logTool(toolCall.name, args);

        const toolResult = await executeTool(

            toolCall.name,

            args

        );

        logToolResult(toolResult);

        input.push(toolCall);

        input.push({

            type: "function_call_output",

            call_id: toolCall.call_id,

            output: JSON.stringify(toolResult)

        });

    }

}