import "dotenv/config";
import mongoose from "mongoose";
import Product from "./models/Product.js";

try {
  await mongoose.connect(process.env.MONGODB_URI);

  await Product.findOneAndUpdate(
    { name: "PayPilot Pro Demo" },
    {
      name: "PayPilot Pro Demo",
      description: "A demo purchase for the PayPal sandbox checkout.",
      price: 5,
      currency: "USD",
      active: true
    },
    { upsert: true, new: true }
  );

  console.log("Demo product created or updated.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}