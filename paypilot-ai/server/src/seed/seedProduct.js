import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import Organization from '../models/Organization.js';
import { provisionOrganizationVendors } from '../Service/provisionOrganization.js';

// Fictional brands and sample INR prices on purpose: these are demo items,
// not real merchants or converted market prices. Prices are stored in paise.
const products = [
  { name: 'TaskFlow Starter', category: 'project-management', pricingModel: 'per_seat', unitPriceCents: 14900, currency: 'INR', maxSeats: 10,
    description: 'Simple task boards for small teams.', features: ['Kanban boards', 'Basic reporting', '5 GB storage'] },
  { name: 'TaskFlow Business', category: 'project-management', pricingModel: 'per_seat', unitPriceCents: 39900, currency: 'INR', maxSeats: 100,
    description: 'Timelines, workload view and integrations.', features: ['Gantt timelines', 'Workload view', 'Integrations', '100 GB storage'] },
  { name: 'Boardly Team', category: 'project-management', pricingModel: 'flat', unitPriceCents: 79900, currency: 'INR', maxSeats: 15,
    description: 'Flat-price workspace for up to 15 people.', features: ['Unlimited boards', 'Automations', 'Time tracking'] },
  { name: 'Boardly Premium', category: 'project-management', pricingModel: 'flat', unitPriceCents: 149900, currency: 'INR', maxSeats: 50,
    description: 'Advanced permissions, audit logs and priority support.', features: ['Everything in Team', 'Audit logs', 'SSO', 'Priority support'] },
  { name: 'SprintHub Pro', category: 'project-management', pricingModel: 'per_seat', unitPriceCents: 49900, currency: 'INR', maxSeats: 200,
    description: 'Agile sprints and roadmaps for software teams.', features: ['Sprints', 'Roadmaps', 'Backlog grooming'] },
  { name: 'LeadLoop CRM Basic', category: 'crm', pricingModel: 'per_seat', unitPriceCents: 29900, currency: 'INR', maxSeats: 25,
    description: 'Contact and deal tracking.', features: ['Contacts', 'Deal pipeline', 'Email logging'] },
  { name: 'LeadLoop CRM Plus', category: 'crm', pricingModel: 'per_seat', unitPriceCents: 69900, currency: 'INR', maxSeats: 250,
    description: 'Automation and forecasting.', features: ['Workflow automation', 'Forecasting', 'Custom fields'] },
  { name: 'PixelDesk Studio', category: 'design', pricingModel: 'per_seat', unitPriceCents: 24900, currency: 'INR', maxSeats: 50,
    description: 'Collaborative design and prototyping.', features: ['Shared libraries', 'Prototyping', 'Comments'] },
  { name: 'ChatBridge Teams', category: 'communication', pricingModel: 'per_seat', unitPriceCents: 19900, currency: 'INR', maxSeats: 500,
    description: 'Team chat and video calls.', features: ['Channels', 'Video calls', 'File sharing'] },
  { name: 'LedgerLite', category: 'accounting', pricingModel: 'flat', unitPriceCents: 49900, currency: 'INR', maxSeats: 5,
    description: 'Simple bookkeeping for tiny businesses.', features: ['Invoicing', 'Expense tracking', 'Basic reports'] },
];

await mongoose.connect(process.env.MONGODB_URI);
try {
  const seededProducts = await Promise.all(products.map((product) => Product.findOneAndUpdate(
    { name: product.name },
    { $set: product },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  )));
  const organization = await Organization.findOneAndUpdate(
    { name: 'PayPilot Demo Workspace' },
    { $setOnInsert: { name: 'PayPilot Demo Workspace' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await provisionOrganizationVendors(organization._id);
  const vendors = await Vendor.countDocuments({ organization: organization._id });
  console.log(`Seeded ${seededProducts.length} catalog products, ${vendors} demo vendors and organization-specific offers`);
} finally {
  await mongoose.disconnect();
}