import { Router } from "express";
import {
  createOrder,
  captureOrder,
  getTransactions
} from "../Controllers/payment.controller.js";

const router = Router();

router.post("/orders", createOrder);
router.post("/capture", captureOrder);
router.get("/transactions", getTransactions);

export default router;