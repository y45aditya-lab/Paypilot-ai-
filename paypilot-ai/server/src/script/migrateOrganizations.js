import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/Auditlog.js';
import Vendor from '../models/Vendor.js';
import VendorOffer from '../models/VendorOffer.js';
import { provisionOrganizationVendors } from '../Service/provisionOrganization.js';

const roleMap = { admin: 'admin', manager: 'manager', finance: 'finance', employee: 'employee', user: 'employee' };

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must be configured before running the organization migration.');
await mongoose.connect(process.env.MONGODB_URI);
try {
  const users = await User.find().select('_id name email role organization').sort({ createdAt: 1 });
  if (!users.length) {
    console.log('No existing users require migration.');
    process.exitCode = 0;
  } else {
    const userOrganizations = new Map();
    for (const user of users) {
      let organizationId = user.organization;
      if (!organizationId) {
        const organization = await Organization.create({ name: `${user.name}'s workspace` });
        organizationId = organization._id;
        await provisionOrganizationVendors(organizationId);
        await User.updateOne(
          { _id: user._id, organization: { $exists: false } },
          { $set: { organization: organizationId, role: roleMap[user.role] ?? 'employee', department: 'General' } },
        );
        await Promise.all([
          Order.updateMany({ user: user._id, organization: { $exists: false } }, { organization: organizationId }),
          Transaction.updateMany({ user: user._id, organization: { $exists: false } }, { organization: organizationId }),
          Notification.updateMany({ user: user._id, organization: { $exists: false } }, { organization: organizationId }),
          AuditLog.updateMany({ user: user._id, organization: { $exists: false } }, { organization: organizationId }),
        ]);
      } else {
        const normalizedRole = roleMap[user.role] ?? 'employee';
        if (normalizedRole !== user.role) await User.updateOne({ _id: user._id }, { role: normalizedRole });
      }
      userOrganizations.set(String(user._id), organizationId);
    }

    const legacyOwner = users.find((user) => user.role === 'admin') ?? users[0];
    const legacyOrganization = userOrganizations.get(String(legacyOwner._id));
    const [vendors, offers] = await Promise.all([
      Vendor.updateMany({ organization: { $exists: false } }, { organization: legacyOrganization }),
      VendorOffer.updateMany({ organization: { $exists: false } }, { organization: legacyOrganization }),
    ]);
    console.log(`Organization migration complete: ${users.length} users, ${vendors.modifiedCount} legacy vendors, ${offers.modifiedCount} legacy offers.`);
  }
} finally {
  await mongoose.disconnect();
}
