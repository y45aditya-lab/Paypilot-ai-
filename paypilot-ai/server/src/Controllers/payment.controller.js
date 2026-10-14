import mongoose from "mongoose";
import Product from "../models/Product.js";
import Payment from "../models/Payment.js";

import {
  createPayPalOrder,
  getPayPalOrder,
  capturePayPalOrder
} from "../Service/paypal.service.js";

export async function createOrder(req, res) {
  let payment;

  try {
    const { productId } = req.body;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        message: "Invalid product ID"
      });
    }

    const product = await Product.findOne({
      _id: productId,
      active: true
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    const amount = product.price.toFixed(2);

    payment = await Payment.create({
      productId: product._id,
      productName: product.name,
      amount,
      currency: product.currency,
      status: "PENDING"
    });

    const order = await createPayPalOrder({
      paymentId: payment._id,
      amount,
      currency: product.currency
    });

    if (!order.id || order.status !== "CREATED") {
      payment.status = "REVIEW_REQUIRED";
      await payment.save();

      return res.status(502).json({
        message: "PayPal order creation was not confirmed"
      });
    }

    payment.paypalOrderId = order.id;
    await payment.save();

    return res.status(201).json({
      paymentId: payment._id,
      orderId: order.id
    });
  } catch (error) {
    console.error("Order creation failed:", error.message);

    if (payment && !payment.paypalOrderId) {
      payment.status = "REVIEW_REQUIRED";
      await payment.save().catch(() => {});
    }

    return res.status(502).json({
      message: "Could not confirm order creation"
    });
  }
}

export async function captureOrder(req, res) {
  try {
    const { orderId } = req.body;

    if (typeof orderId !== "string" || !orderId.trim()) {
      return res.status(400).json({
        message: "Invalid order ID"
      });
    }

    const payment = await Payment.findOne({
      paypalOrderId: orderId
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment record not found"
      });
    }

    if (payment.status === "COMPLETED") {
      return res.json({
        status: payment.status,
        captureId: payment.paypalCaptureId,
        amount: payment.amount,
        currency: payment.currency,
        productName: payment.productName
      });
    }

    const order = await getPayPalOrder(orderId);

    if (
      order.id !== orderId ||
      order.status !== "APPROVED" ||
      order.purchase_units?.length !== 1 ||
      order.purchase_units[0].custom_id !== String(payment._id)
    ) {
      return res.status(409).json({
        message: "Order is not approved or does not match"
      });
    }

    const orderAmount = order.purchase_units[0].amount;

    if (
      orderAmount?.value !== payment.amount ||
      orderAmount?.currency_code !== payment.currency
    ) {
      payment.status = "REVIEW_REQUIRED";
      await payment.save();

      return res.status(409).json({
        message: "Order amount or currency mismatch"
      });
    }

    const result = await capturePayPalOrder(
      orderId,
      payment._id
    );

    const capture = result.purchase_units
      ?.flatMap(unit => unit.payments?.captures || [])
      .find(item => item.status === "COMPLETED");

    if (
      result.id !== orderId ||
      result.status !== "COMPLETED" ||
      !capture ||
      capture.amount?.value !== payment.amount ||
      capture.amount?.currency_code !== payment.currency
    ) {
      payment.status = "REVIEW_REQUIRED";
      await payment.save();

      return res.status(409).json({
        message: "Capture requires verification"
      });
    }

    payment.status = "COMPLETED";
    payment.paypalCaptureId = capture.id;
    await payment.save();

    return res.json({
      status: payment.status,
      captureId: capture.id,
      amount: payment.amount,
      currency: payment.currency,
      productName: payment.productName
    });
  } catch (error) {
    console.error("Capture failed:", error.message);

    return res.status(502).json({
      message:
        "Payment outcome is uncertain. Verify the order before retrying."
    });
  }
}

export async function getTransactions(req, res) {
  try {
    const transactions = await Payment.find()
      .sort({ createdAt: -1 })
      .select(
        "productName amount currency status paypalCaptureId createdAt"
      )
      .lean();

    return res.json(transactions);
  } catch {
    return res.status(500).json({
      message: "Could not load transactions"
    });
  }
}