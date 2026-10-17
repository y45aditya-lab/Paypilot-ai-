import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    productName: { type: String, required: true },
    amount: { type: String, required: true },
    currency: { type: String, required: true },

    paypalOrderId: {
      type: String,
      unique: true,
      sparse: true
    },
    paypalCaptureId: { type: String, default: null },

    status: {
      type: String,
      enum: [
        "PENDING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "REVIEW_REQUIRED"
      ],
      default: "PENDING"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);