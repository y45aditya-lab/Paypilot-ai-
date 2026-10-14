import { Router } from "express";
import Product from "../models/Product.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ active: true });

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

export default router;