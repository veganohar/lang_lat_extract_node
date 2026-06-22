import { processMessage } from "./aiService.js";

export async function chat(req, res) {

    try {

        const { message } = req.body;

        const reply = await processMessage(message);

        res.json({

            success: true,

            message: reply

        });

    } catch (e) {

        console.error(e);

        res.status(500).json({

            success: false,

            message: e.message

        });

    }

}