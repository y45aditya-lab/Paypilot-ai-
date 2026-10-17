import { useEffect, useState } from 'react';
import {
  createVendor,
  createVendorOffer,
  deactivateVendorOffer,
  getAdminProducts,
  getVendorOffers,
  getVendors,
  updateVendor,
  updateVendorOffer,
} from '../services/api.js';

const inputClass = 'w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/60';

export default function InventoryVendors() {
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [offers, setOffers] = useState([]);
  const [vendorForm, setVendorForm] = useState({ name: '', contactEmail: '', website: '', notes: '' });
  const [offerForm, setOfferForm] = useState({ productId: '', vendorId: '', price: '', stockQuantity: '10' });
  const [edits, setEdits] = useState({});
  const [vendorEdits, setVendorEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadWorkspace() {
    const [productData, vendorData, offerData] = await Promise.all([
      getAdminProducts(),
      getVendors(),
      getVendorOffers(),
    ]);
    setProducts(productData.products ?? []);
    setVendors(vendorData.vendors ?? []);
    setOffers(offerData.offers ?? []);
  }

  useEffect(() => {
    let ignore = false;
    Promise.all([getAdminProducts(), getVendors(), getVendorOffers()])
      .then(([productData, vendorData, offerData]) => {
        if (ignore) return;
        setProducts(productData.products ?? []);
        setVendors(vendorData.vendors ?? []);
        setOffers(offerData.offers ?? []);
      })
      .catch((err) => { if (!ignore) setError(err.message || 'Could not load inventory and vendors.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  async function submit(action, successMessage) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await action();
      await loadWorkspace();
      setNotice(successMessage);
    } catch (err) {
      setError(err.message || 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleCreateVendor(event) {
    event.preventDefault();
    void submit(async () => {
      await createVendor(vendorForm);
      setVendorForm({ name: '', contactEmail: '', website: '', notes: '' });
    }, 'Vendor added.');
  }

  function handleCreateOffer(event) {
    event.preventDefault();
    if (!Number.isFinite(Number(offerForm.price)) || Number(offerForm.price) < 0
      || !Number.isInteger(Number(offerForm.stockQuantity)) || Number(offerForm.stockQuantity) < 0) {
      setError('Enter a valid rupee price and whole-number stock quantity.');
      return;
    }
    void submit(async () => {
      await createVendorOffer({
        productId: offerForm.productId,
        vendorId: offerForm.vendorId,
        priceCents: Math.round(Number(offerForm.price) * 100),
        currency: 'INR',
        stockQuantity: Number(offerForm.stockQuantity),
      });
      setOfferForm({ productId: '', vendorId: '', price: '', stockQuantity: '10' });
    }, 'Vendor offer added.');
  }

  function saveOffer(offer) {
    const edit = edits[offer._id] ?? {
      price: (offer.priceCents / 100).toFixed(2),
      stockQuantity: String(offer.stockQuantity),
    };
    if (!Number.isFinite(Number(edit.price)) || Number(edit.price) < 0
      || !Number.isInteger(Number(edit.stockQuantity)) || Number(edit.stockQuantity) < 0) {
      setError('Enter a valid rupee price and whole-number stock quantity.');
      return;
    }
    void submit(() => updateVendorOffer(offer._id, {
      priceCents: Math.round(Number(edit.price) * 100),
      stockQuantity: Number(edit.stockQuantity),
    }), 'Price and stock updated.');
  }

  if (loading) return <p className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-sm text-slate-400">Loading vendor inventory…</p>;

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 sm:p-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Administrator workspace</p>
        <h2 className="mt-1 text-2xl font-bold text-white">Vendors & inventory</h2>
        <p className="mt-1 text-sm text-slate-400">Manage supplier listings, compare INR quotes, and update vendor-reported stock.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-200">{notice}</p>}

      <form onSubmit={handleCreateVendor} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <h3 className="font-semibold text-white">Add a vendor</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputClass} aria-label="Vendor name" placeholder="Vendor name" required minLength="2" maxLength="100" value={vendorForm.name} onChange={(event) => setVendorForm({ ...vendorForm, name: event.target.value })} />
          <input className={inputClass} aria-label="Contact email" type="email" placeholder="Contact email" value={vendorForm.contactEmail} onChange={(event) => setVendorForm({ ...vendorForm, contactEmail: event.target.value })} />
          <input className={inputClass} aria-label="HTTPS website" type="url" placeholder="https://vendor.example" value={vendorForm.website} onChange={(event) => setVendorForm({ ...vendorForm, website: event.target.value })} />
          <input className={inputClass} aria-label="Vendor notes" placeholder="Notes" maxLength="500" value={vendorForm.notes} onChange={(event) => setVendorForm({ ...vendorForm, notes: event.target.value })} />
        </div>
        <button disabled={saving} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">Add vendor</button>
      </form>

      <form onSubmit={handleCreateOffer} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <h3 className="font-semibold text-white">Add a product offer</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className={inputClass} required aria-label="Product" value={offerForm.productId} onChange={(event) => setOfferForm({ ...offerForm, productId: event.target.value })}>
            <option value="">Choose product</option>
            {products.filter((product) => product.active).map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
          </select>
          <select className={inputClass} required aria-label="Vendor" value={offerForm.vendorId} onChange={(event) => setOfferForm({ ...offerForm, vendorId: event.target.value })}>
            <option value="">Choose vendor</option>
            {vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor._id} value={vendor._id}>{vendor.name}</option>)}
          </select>
          <input className={inputClass} aria-label="Monthly price in rupees" type="number" min="0" step="0.01" required placeholder="Price / month (₹)" value={offerForm.price} onChange={(event) => setOfferForm({ ...offerForm, price: event.target.value })} />
          <input className={inputClass} aria-label="Available stock" type="number" min="0" step="1" required placeholder="Available licenses" value={offerForm.stockQuantity} onChange={(event) => setOfferForm({ ...offerForm, stockQuantity: event.target.value })} />
        </div>
        <button disabled={saving || vendors.every((vendor) => !vendor.active) || products.every((product) => !product.active)} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">Add offer</button>
      </form>

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-white">Vendor price & stock comparison</h3>
          <p className="mt-1 text-xs text-slate-500">Availability is vendor-reported; update stock when a supplier confirms a change.</p>
        </div>
        {offers.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-400">No vendor offers yet. Add a vendor and a product offer above.</p> : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/4 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="p-3">Product</th><th className="p-3">Vendor</th><th className="p-3">Monthly price</th><th className="p-3">Available licenses</th><th className="p-3">Availability</th><th className="p-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {offers.map((offer) => {
                  const edit = edits[offer._id] ?? { price: (offer.priceCents / 100).toFixed(2), stockQuantity: String(offer.stockQuantity) };
                  const active = offer.active && offer.vendor?.active;
                  return (
                    <tr key={offer._id} className={!active ? 'opacity-50' : ''}>
                      <td className="p-3 font-medium text-white">{offer.product?.name ?? 'Removed product'}</td>
                      <td className="p-3 text-slate-300">{offer.vendor?.name ?? 'Removed vendor'}{!offer.vendor?.active && <span className="ml-2 text-xs text-amber-200">inactive</span>}</td>
                      <td className="p-3"><input className={`${inputClass} w-32`} aria-label={`Monthly price for ${offer.product?.name}`} type="number" min="0" step="0.01" value={edit.price} onChange={(event) => setEdits({ ...edits, [offer._id]: { ...edit, price: event.target.value } })} /> <span className="text-xs text-slate-500">INR</span></td>
                      <td className="p-3"><input className={`${inputClass} w-28`} aria-label={`Stock for ${offer.product?.name}`} type="number" min="0" step="1" value={edit.stockQuantity} onChange={(event) => setEdits({ ...edits, [offer._id]: { ...edit, stockQuantity: event.target.value } })} /></td>
                      <td className="p-3 text-slate-300">{!active ? 'Inactive' : offer.stockQuantity === 0 ? 'Out of stock' : offer.stockQuantity < 10 ? 'Limited' : 'In stock'}</td>
                      <td className="space-x-2 p-3">
                        <button type="button" disabled={saving} onClick={() => saveOffer(offer)} className="rounded-md border border-emerald-300/20 px-2 py-1 text-xs text-emerald-100 disabled:opacity-40">Save</button>
                        <button type="button" disabled={saving} onClick={() => void submit(
                          () => offer.active
                            ? deactivateVendorOffer(offer._id)
                            : updateVendorOffer(offer._id, { active: true }),
                          offer.active ? 'Offer deactivated.' : 'Offer reactivated.',
                        )} className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 disabled:opacity-40">{offer.active ? 'Deactivate' : 'Reactivate'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {vendors.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-white">Vendors</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {vendors.map((vendor) => (
              <li key={vendor._id} className="space-y-2 rounded-lg border border-white/10 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {['name', 'contactEmail', 'website', 'notes'].map((field) => (
                    <input
                      key={field}
                      className={inputClass}
                      aria-label={`${field} for ${vendor.name}`}
                      placeholder={field === 'website' ? 'https://vendor.example' : field}
                      type={field === 'contactEmail' ? 'email' : field === 'website' ? 'url' : 'text'}
                      value={(vendorEdits[vendor._id] ?? vendor)[field] ?? ''}
                      onChange={(event) => setVendorEdits({
                        ...vendorEdits,
                        [vendor._id]: { ...((vendorEdits[vendor._id] ?? vendor)), [field]: event.target.value },
                      })}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs ${vendor.active ? 'text-emerald-200' : 'text-amber-200'}`}>{vendor.active ? 'Active' : 'Inactive'}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={saving} onClick={() => void submit(
                      () => updateVendor(vendor._id, {
                        name: (vendorEdits[vendor._id] ?? vendor).name,
                        contactEmail: (vendorEdits[vendor._id] ?? vendor).contactEmail ?? '',
                        website: (vendorEdits[vendor._id] ?? vendor).website ?? '',
                        notes: (vendorEdits[vendor._id] ?? vendor).notes ?? '',
                      }),
                      'Vendor details updated.',
                    )} className="rounded-md border border-emerald-300/20 px-2 py-1 text-xs text-emerald-100 disabled:opacity-40">Save details</button>
                    <button type="button" disabled={saving} onClick={() => void submit(() => updateVendor(vendor._id, { active: !vendor.active }), vendor.active ? 'Vendor deactivated.' : 'Vendor reactivated.')} className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 disabled:opacity-40">{vendor.active ? 'Deactivate' : 'Reactivate'}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
