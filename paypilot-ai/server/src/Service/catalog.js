import Product from '../models/Product.js';
import { computeTotalCents } from './Pricing.js';

// This is what the AI is allowed to "see". It reads the DB; it never writes.
export async function searchCatalog({ category, seats, maxTotalCents }) {
  const filter = {
    active: true,
    minSeats: { $lte: seats },
    maxSeats: { $gte: seats },
  };
  if (category) filter.category = category;

  const products = await Product.find(filter).lean();

  return products
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      category: p.category,
      description: p.description,
      features: p.features,
      pricingModel: p.pricingModel,
      unitPriceCents: p.unitPriceCents,
      totalCents: computeTotalCents(p, seats), // server-computed, not model-computed
      currency: p.currency,
    }))
    .filter((p) => maxTotalCents == null || p.totalCents <= maxTotalCents)
    .sort((a, b) => a.totalCents - b.totalCents);
}