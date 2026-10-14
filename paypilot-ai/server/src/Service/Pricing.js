// The ONLY place totals are calculated. Everything else calls this.
export function computeTotalCents(product, seats) {
  return product.pricingModel === 'per_seat'
    ? product.unitPriceCents * seats
    : product.unitPriceCents;
}