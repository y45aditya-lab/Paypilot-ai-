import mongoose from 'mongoose';
import Product from '../models/Product.js';
import { computeTotalCents } from './Pricing.js';

/**
 * Takes the model's SUGGESTION (productId + seats) and rebuilds the truth from
 * the database. Nothing the model said about prices is used.
 */
export async function buildQuote({ productId, seats, budgetCents }) {
  if (!mongoose.isValidObjectId(productId)) {
    return { ok: false, errors: ['Recommended product does not exist.'] };
  }
  const product = await Product.findOne({ _id: productId, active: true }).lean();
  if (!product) return { ok: false, errors: ['Recommended product does not exist.'] };

  if (!Number.isInteger(seats) || seats < 1 || seats > 1000) {
    return { ok: false, errors: ['Invalid seat count.'] };
  }
  if (seats < product.minSeats || seats > product.maxSeats) {
    return { ok: false, errors: [`${product.name} supports ${product.minSeats}-${product.maxSeats} seats.`] };
  }

  const totalCents = computeTotalCents(product, seats);
  if (totalCents > budgetCents) {
    return { ok: false, errors: [`Total exceeds the budget by ${totalCents - budgetCents} cents.`] };
  }

  return {
    ok: true,
    quote: {
      product: {
        id: String(product._id),
        name: product.name,
        category: product.category,
        description: product.description,
        features: product.features,
      },
      seats,
      pricingModel: product.pricingModel,
      unitPriceCents: product.unitPriceCents,
      totalCents,
      currency: product.currency,
      billingPeriod: product.billingPeriod,
      budgetCents,
      remainingCents: budgetCents - totalCents,
    },
  };
}