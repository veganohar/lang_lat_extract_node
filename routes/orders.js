import express from "express";
import { newOrder, getOrders, deleteOrder, bulkDeleteOrders, updateOrder } from "../services/orders.js";

const router = express.Router();

router.get("/getOrders", async (req, res) => {
  try {
    const range = "Orders!A2:Q"
    const rows = await getOrders(range);
    res.json({ data: rows });
  } catch (error) {
    console.error("❌ Error Fetching Orders Data:", error);
    res.status(500).json({ error: "Failed Fetching Orders Data" });
  }
});

router.post("/newOrder", async (req, res) => {
  try {
    const range = "Orders!A:Q";
    const rows = await newOrder(range,req.body);
    res.status(200).json({ data: rows, status:200, message:"New Order Created Successfully!" });
  } catch (error) {
    console.error("❌ Error Creating New Order Data:", error);
    res.status(500).json({ error: "Failed Creating New Order Data" });
  }
});

router.put("/updateOrder/:rowNumber", async (req, res) => {
  try {
    const rows = await updateOrder(req.body,req.params.rowNumber);
    res.status(200).json({ data: rows, status:200, message:" Order Updated Successfully!" });
  } catch (error) {
    console.error("❌ Error Updating Order Data:", error);
    res.status(500).json({ error: "Failed Updating Order Data" });
  }
});

router.delete("/deleteOrder/:rowNumber", async (req, res) => {
  try {
    const rows = await deleteOrder(req.params.rowNumber);
    res.status(204).json({ data: rows, status:204, message:" Order Deleted Successfully!" });
  } catch (error) {
    console.error("❌ Error Deleteing Order Data:", error);
    res.status(500).json({ error: "Failed Deleteing Order Data" });
  }
});

router.delete("/bulkDelete/:rowNumbers", async (req, res) => {
  try {
    const rows = await bulkDeleteOrders(req.params.rowNumbers);
    res.status(204).json({ data: rows, status:204, message:" Orders Deleted Successfully!" });
  } catch (error) {
    console.error("❌ Error Deleting Orders Data:", error);
    res.status(500).json({ error: "Failed Deleting Orders Data" });
  }
});


export default router;