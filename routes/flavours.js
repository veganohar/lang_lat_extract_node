import express from "express";
import { getFlavours } from "../services/flavours.js";

const router = express.Router();

router.get("/getFlavours", async (req, res) => {
  try {
    const rows = await getFlavours();
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error Fetching Flavours Data:", error);
    res.status(500).json({ error: "Failed Fetching Flavours Data" });
  }
});

export default router;