import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select:false = queries do NOT return the hash unless you ask for it explicitly
    passwordHash: { type: String, required: true, select: false },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    role: { type: String, enum: ['admin', 'manager', 'finance', 'employee'], default: 'employee' },
    department: { type: String, trim: true, maxlength: 80, default: 'General' },
    notificationPreferences: {
      payment: { type: Boolean, default: true },
      approvals: { type: Boolean, default: true },
      budget: { type: Boolean, default: true },
      risk: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ organization: 1, role: 1, department: 1 });

export default mongoose.model('User', userSchema);