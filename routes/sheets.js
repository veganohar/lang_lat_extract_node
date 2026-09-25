import express from "express";
import { readSheet, synchDistances, writeLatLng, getPrices } from "../services/sheets.js";
import { CUSTOMER_SHEET, getSheetField, getSheetRange } from "../data/sheetSchema.js";

const customerLatLngRange = getSheetRange(CUSTOMER_SHEET, {
  startRow: 2,
  fields: [getSheetField(CUSTOMER_SHEET, "latLng")],
});

const router = express.Router();

router.get("/writeLatLng", async (req, res) => {
  try {
    const range = customerLatLngRange;
    const rows = await writeLatLng(range);
    res.json({ data: rows });
  } catch (error) {
    console.error("Error Writing LatLng to sheet:", error);
    res.status(500).json({ error: "Failed Writing LatLng to sheet" });
  }
});

router.get("/read", async (req, res) => {
  try {
    const range = customerLatLngRange;
    const rows = await readSheet(range);
    res.json({ data: rows });
  } catch (error) {
    console.error("Error Reading LatLng from sheet:", error);
    res.status(500).json({ error: "Failed Reading LatLng from sheet" });
  }
});


router.get("/synchDistances", async (req, res) => {
  try {
    const range = customerLatLngRange;
    const rows = await synchDistances(range);
    res.status(200).json({ data: rows });
  } catch (error) {
    console.error("Error Synching Distances:", error);
    res.status(500).json({ error: "Failed Synching Distances" });
  }
});

router.get("/getPrices", async (req, res) => {
  try {
    const rows = await getPrices();
    res.status(200).json({ data: rows });
  } catch (error) {
    console.error("Error Getting Pricing Info:", error);
    res.status(500).json({ error: "Failed Getting Pricing Info" });
  }
});

export default router;
