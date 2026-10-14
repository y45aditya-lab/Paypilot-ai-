import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['project-management', 'crm', 'design', 'communication', 'accounting'],
    },
    description: { type: String, required: true },
    features: [String],

    // MONEY RULE: always integer cents. 2999 = $29.99
    unitPriceCents: { type: Number, required: true, min: 0, validate: Number.isInteger },
    currency: { type: String, default: 'USD' },
    billingPeriod: { type: String, enum: ['month'], default: 'month' },

    // per_seat: total = price x seats.  flat: total = price, whatever the seats
    pricingModel: { type: String, enum: ['per_seat', 'flat'], required: true },
    minSeats: { type: Number, default: 1 },
    maxSeats: { type: Number, default: 10000 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Product', productSchema);