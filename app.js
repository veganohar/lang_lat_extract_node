// app.js
import express from "express";
import cors from "cors";

import coordsRoutes from "./routes/coords.js";
import sheetRoutes from "./routes/sheets.js";
import routePlannerRoutes from "./routes/routePlanner.js";
import customerRoutes from "./routes/customers.js";
import orderRoutes from "./routes/orders.js";
import flavourRoutes from "./routes/flavours.js";
import aiRouter from "./ai/aiRouter.js";

import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const apiRouter = express.Router();

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

apiRouter.use("/ai", aiRouter);

apiRouter.use("/coords", coordsRoutes);
apiRouter.use("/sheets", sheetRoutes);
apiRouter.use("/routePlanner", routePlannerRoutes);
apiRouter.use("/customers", customerRoutes);
apiRouter.use("/orders", orderRoutes);
apiRouter.use("/flavours", flavourRoutes);

app.get("/",(req,res)=>{
    res.send("Server Running")
})
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
