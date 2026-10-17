import mongoose from 'mongoose';

const organizationInviteSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['manager', 'finance', 'employee'], required: true },
  department: { type: String, required: true, trim: true, maxlength: 80 },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: Date,
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

organizationInviteSchema.index({ organization: 1, email: 1, usedAt: 1 });

export default mongoose.model('OrganizationInvite', organizationInviteSchema);
