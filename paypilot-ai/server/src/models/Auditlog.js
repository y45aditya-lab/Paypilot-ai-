import mongoose from 'mongoose';

// Append-only history: we only ever create entries, never edit or delete them.
const auditLogSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    action: { type: String, required: true, index: true }, // e.g. 'capture.completed'
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    meta: mongoose.Schema.Types.Mixed, // small facts only. NEVER secrets or tokens
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ organization: 1, user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);