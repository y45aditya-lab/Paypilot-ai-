import mongoose from 'mongoose';

const departmentBudgetSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  department: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, default: 'all' },
  amountCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  reservedCents: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  currency: { type: String, required: true, default: 'INR' },
  period: { type: String, enum: ['monthly'], default: 'monthly' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

departmentBudgetSchema.index({ organization: 1, department: 1, category: 1, currency: 1 }, { unique: true });

export default mongoose.model('DepartmentBudget', departmentBudgetSchema);
