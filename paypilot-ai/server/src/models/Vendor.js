import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    website: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 500 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

vendorSchema.index({ organization: 1, name: 1 }, { unique: true });

export default mongoose.model('Vendor', vendorSchema);
