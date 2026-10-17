import { Router } from "express";
import Product from "../models/Product.js";
import VendorOffer from "../models/VendorOffer.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ active: true }).lean();
    const offers = await VendorOffer.find({
      organization: req.user.organizationId,
      product: { $in: products.map((product) => product._id) },
      active: true,
    })
      .populate({ path: "vendor", select: "name website active" })
      .lean();
    const offersByProduct = new Map();
    for (const offer of offers) {
      if (!offer.vendor?.active) continue;
      const productId = String(offer.product);
      const items = offersByProduct.get(productId) ?? [];
      items.push({
        id: String(offer._id),
        vendor: { id: String(offer.vendor._id), name: offer.vendor.name, website: offer.vendor.website },
        priceCents: offer.priceCents,
        currency: offer.currency,
        stockQuantity: offer.stockQuantity,
        availability: offer.stockQuantity === 0 ? "out_of_stock" : offer.stockQuantity < 10 ? "limited" : "in_stock",
      });
      offersByProduct.set(productId, items);
    }
    for (const product of products) {
      product.vendorOffers = (offersByProduct.get(String(product._id)) ?? [])
        .sort((a, b) => a.priceCents - b.priceCents);
    }

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

export default router;