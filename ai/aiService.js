import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export async function processMessage(message) {

    const response = await client.responses.create({

        model: "gpt-5-mini",

        input: [

            {
                role: "system",
                content: ""
            },

            {
                role: "user",
                content: message
            }

        ]

    });

    return response.output_text;
}