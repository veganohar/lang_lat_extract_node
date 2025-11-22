import express from "express";
import { getFlavours, getRecipe } from "../services/flavours.js";

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

router.get("/getrecipe/:flavour/:tins", async (req, res) => {
  try {
    const rows =  getRecipe(req.params.flavour, Number(req.params.tins));
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error Fetching Reciepe:", error);
    res.status(500).json({ error: "Failed Fetching Reciepe" });
  }
});

export default router;