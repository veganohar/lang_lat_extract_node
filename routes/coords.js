// routes/coords.js
import express from "express";
import { getLatLng } from "../services/coords.js"; // add .js extension

const router = express.Router();

// GET /coords?url=<shortUrl>
router.get("/", async (req, res) => {
  const shortUrl = req.query.url;
  if (!shortUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  try {
    const result = await getLatLng(shortUrl);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get coordinates" });
  }
});



export default router; // ✅ correct export for ESM
