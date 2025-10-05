import express from "express";
import { readSheet, writeLatLng } from "../services/sheets.js";

const router = express.Router();

router.get("/writeLatLng", async (req, res) => {
  try {
    const range = "Sheet1!E2:E"
    const rows = await writeLatLng(range);
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error Writing LatLng to sheet:", error);
    res.status(500).json({ error: "Failed Writing LatLng to sheet" });
  }
});

router.get("/read", async (req, res) => {
  try {
    const range = "Sheet1!E2:E"
    const rows = await readSheet(range);
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error Reading LatLng from sheet:", error);
    res.status(500).json({ error: "Failed Reading LatLng from sheet" });
  }
});

export default router;
