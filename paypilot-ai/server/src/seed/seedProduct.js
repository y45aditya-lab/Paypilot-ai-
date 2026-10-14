import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

// Fictional brands on purpose: these are DEMO catalog items, not real merchants.
const products = [
  { name: 'TaskFlow Starter', category: 'project-management', pricingModel: 'per_seat', unitPriceCents: 900, maxSeats: 10,
    description: 'Simple task boards for small teams.', features: ['Kanban boards', 'Basic reporting', '5 GB storage'] },
  { name: 'TaskFlow Business', category: 'project-management', pricingModel: 'per_seat', unitPriceCents: 1800, maxSeats: 100,
    description: 'Timelines, workload view and integrations.', features: ['Gantt timelines', 'Workload view', 'Integrations', '100 GB storage'] },
  { name: 'Boardly Team', category: 'project-management', pricingModel: 'flat', unitPriceCents: 7900, maxSeats: 15,
    description: 'Flat-price workspace for up to 15 people.', features: ['Unlimited boards', 'Automations', 'Time tracking'] },
  { name: 'Boardly Premium', category: 'project-management', pricingModel: 'flat', unitPriceCents: 14900, maxSeats: 50,
    description: 'Advanced permissions, audit logs and priority support.', features: ['Everything in Team', 'Audit logs', 'SSO', 'Priority support'] },
  { name: 'SprintHub Pro', category: 'project-management', pricingModel: 'per_seat', unitPriceCents: 2400, maxSeats: 200,
    description: 'Agile sprints and roadmaps for software teams.', features: ['Sprints', 'Roadmaps', 'Backlog grooming'] },
  { name: 'LeadLoop CRM Basic', category: 'crm', pricingModel: 'per_seat', unitPriceCents: 1500, maxSeats: 25,
    description: 'Contact and deal tracking.', features: ['Contacts', 'Deal pipeline', 'Email logging'] },
  { name: 'LeadLoop CRM Plus', category: 'crm', pricingModel: 'per_seat', unitPriceCents: 3000, maxSeats: 250,
    description: 'Automation and forecasting.', features: ['Workflow automation', 'Forecasting', 'Custom fields'] },
  { name: 'PixelDesk Studio', category: 'design', pricingModel: 'per_seat', unitPriceCents: 1200, maxSeats: 50,
    description: 'Collaborative design and prototyping.', features: ['Shared libraries', 'Prototyping', 'Comments'] },
  { name: 'ChatBridge Teams', category: 'communication', pricingModel: 'per_seat', unitPriceCents: 800, maxSeats: 500,
    description: 'Team chat and video calls.', features: ['Channels', 'Video calls', 'File sharing'] },
  { name: 'LedgerLite', category: 'accounting', pricingModel: 'flat', unitPriceCents: 3500, maxSeats: 5,
    description: 'Simple bookkeeping for tiny businesses.', features: ['Invoicing', 'Expense tracking', 'Basic reports'] },
];

await mongoose.connect(process.env.MONGODB_URI);
await Product.deleteMany({});          // safe to re-run: resets the demo catalog
await Product.insertMany(products);    // schema validation runs here
console.log(`Seeded ${products.length} products`);
await mongoose.disconnect();