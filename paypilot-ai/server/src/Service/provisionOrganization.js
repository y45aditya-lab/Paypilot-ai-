import Vendor from '../models/Vendor.js';
import VendorOffer from '../models/VendorOffer.js';
import Product from '../models/Product.js';

const DEMO_VENDORS = [
  { name: 'Nimbus Software Supply', contactEmail: 'sales@nimbus.example', website: 'https://nimbus.example', notes: 'Fictional demo vendor.' },
  { name: 'BrightPath Digital', contactEmail: 'hello@brightpath.example', website: 'https://brightpath.example', notes: 'Fictional demo vendor.' },
  { name: 'Northstar Cloud Market', contactEmail: 'team@northstar.example', website: 'https://northstar.example', notes: 'Fictional demo vendor.' },
];

export async function provisionOrganizationVendors(organizationId) {
  const vendors = await Promise.all(DEMO_VENDORS.map((vendor) => Vendor.findOneAndUpdate(
    { organization: organizationId, name: vendor.name },
    { $setOnInsert: { ...vendor, organization: organizationId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )));
  const products = await Product.find({ active: true }).select('_id unitPriceCents currency').lean();
  const operations = products.flatMap((product, index) => {
    const selected = [vendors[index % vendors.length], vendors[(index + 1) % vendors.length]];
    return selected.map((vendor, offerIndex) => ({
      updateOne: {
        filter: { organization: organizationId, product: product._id, vendor: vendor._id },
        update: {
          $setOnInsert: {
            organization: organizationId,
            product: product._id,
            vendor: vendor._id,
            currency: product.currency,
            priceCents: Math.round(product.unitPriceCents * (offerIndex === 0 ? 0.95 : 1.05)),
            stockQuantity: offerIndex === 0 ? 30 : 5,
          },
        },
        upsert: true,
      },
    }));
  });
  if (operations.length) await VendorOffer.bulkWrite(operations, { ordered: false });
}
