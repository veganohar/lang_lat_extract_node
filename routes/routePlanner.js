import express from "express";
import { deliveryPlanner, getOptimizedTrips, planRoutes } from "../services/routePlanner.js";

const router = express.Router();


router.get("/deliveryPlanner/:rowIds/:startTime/:avgDelay", async (req, res) => {
  try {
    const p = req.params;
    const rows = await deliveryPlanner(p.rowIds, p.startTime, Number(p.avgDelay));
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error in Delivery Planner:", error.message, error.stack);
    res.status(500).json({ error: "Failed to generate delivery plan (shortest path and data)" });
  }
})

router.get("/planRoutes", async (req, res) => {
  try {
    const rows = await planRoutes();
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error in Delivery Planner:", error.message, error.stack);
    res.status(500).json({ error: "Failed to generate delivery plan (shortest path and data)" });
  }
})


// router.get('/optimize', async (req, res) => {
//   try {
//     const result = await getOptimizedTrips();
//     res.json({data:result});
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to optimize deliveries' });
//   }
// });

export default router;
