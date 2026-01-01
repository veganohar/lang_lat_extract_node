import express from "express";
import { getCustomers, createCustomer, deleteCustomer, updateCustomer, customerListToMsg } from "../services/customers.js";

const router = express.Router();

router.get("/getCustomers", async (req, res) => {
  try {
    const range = "Sheet1!A2:H"
    const rows = await getCustomers(range);
    res.status(200).json({ data: rows });
  } catch (error) {
    console.error("❌ Error Fetching Customers Data:", error);
    res.status(500).json({ error: "Failed Fetching Customersa Data" });
  }
});

router.get("/customerListToMsg", async (req, res) => {
  try {
    const rows = await customerListToMsg();
    res.status(200).json({ data: rows });
  } catch (error) {
    console.error("❌ Error Fetching Customers List:", error);
    res.status(500).json({ error: "Failed Fetching Customersa List" });
  }
});

router.post("/createCustomer", async (req, res) => {
  try {
    const range = "Sheet1!A:H";
    const rows = await createCustomer(range, req.body);
    res.status(200).json({ data: rows, status: 200, message: "New Customer Created Successfully!" });
  } catch (error) {
    console.error("❌ Error Creating New Customer Data:", error);
    res.status(500).json({ error: "Failed Creating New Customer Data" });
  }
});


router.delete("/deleteCustomer/:rowNumber", async (req, res) => {
  try {
    const rows = await deleteCustomer(req.params.rowNumber);
    res.status(204).json({ data: rows, status:204, message:" Customer Deleted Successfully!" });
  } catch (error) {
    console.error("❌ Error Deleteing Customer Data:", error);
    res.status(500).json({ error: "Failed Deleting Customer Data" });
  }
});

router.put("/updateCustomer/:rowNumber", async (req, res) => {
  try {
    const rows = await updateCustomer(req.body,req.params.rowNumber);
    res.status(200).json({ data: rows, status:200, message:" Customer Updated Successfully!" });
  } catch (error) {
    console.error("❌ Error Updating Customer Data:", error);
    res.status(500).json({ error: "Failed Updating Customer Data" });
  }
});

export default router;