import express from "express";
import cors from "cors";
import productRoutes from "./routes/product.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import recommendationsRouter from './routes/recommendations.js';
const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173"
}));

app.use('/api/recommendations', recommendationsRouter);

app.use(express.json({ limit: "1mb" }));
app.use("/api/products", productRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "PayPilot AI API is running"
  });
});

app.use("/api/products", productRoutes);
app.use("/api/payments", paymentRoutes);

export default app;