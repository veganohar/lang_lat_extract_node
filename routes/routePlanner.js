import express from "express";
import { deliveryPlanner, generateClusters, planDeliveries } from "../services/routePlanner.js";

const router = express.Router();


router.get("/deliveryPlanner/:rowIds/:startTime/:avgDelay", async (req, res) => {
  try {
    const p = req.params;
    const rows = await deliveryPlanner(p.rowIds, p.startTime, Number(p.avgDelay));
    res.json({ data: rows });
  } catch (error) {
    console.error("Error in Delivery Planner:", error.message, error.stack);
    res.status(500).json({ error: "Failed to generate delivery plan (shortest path and data)" });
  }
})


// OptiPath/:startTime/:avgDelay/:numClusters/:minPerCluster/:maxPerCluster
router.get("/generateClusters/:numClusters/:minPerCluster/:maxPerCluster/:orderIds", async (req, res) => {
  try {
    const rows = await generateClusters(req.params);
    res.json({ data: rows });
  } catch (error) {
    console.error("Error in Generating Clusters:", error.message, error.stack);
    res.status(500).json({ error: "Failed to Generating Clusters" });
  }
})

router.post("/planDeliveries", async (req, res) => {
  try {
    const plan = await planDeliveries(JSON.stringify(req.body.orderIds || []));
    res.json({ data: plan });
  } catch (error) {
    console.error("Error planning deliveries:", error.message, error.stack);
    res.status(400).json({ error: error.message || "Failed to plan deliveries." });
  }
});

export default router;
