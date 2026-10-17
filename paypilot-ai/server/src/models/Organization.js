import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  financeApprovalThresholdCents: { type: Number, min: 0, default: 1_000_000 },
  budgetAlertPercent: { type: Number, min: 1, max: 100, default: 80 },
  policyText: { type: String, maxlength: 20_000, default: '' },
  departments: { type: [String], default: ['General'] },
}, { timestamps: true });

export default mongoose.model('Organization', organizationSchema);
