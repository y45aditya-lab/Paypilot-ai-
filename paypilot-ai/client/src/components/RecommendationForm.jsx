import { useState } from 'react';
import { PRODUCT_CATEGORIES } from '../services/stackOptimizer.js';

const EXAMPLES = [
  'We are a 12-person startup and need to track projects and deadlines.',
  'I need a simple CRM to manage customer leads on a tight budget.',
  'Our remote team needs better collaboration and communication tools.',
];

export default function RecommendationForm({ onSubmit, loading }) {
  const [message, setMessage] = useState('Find the best software subscription under ₹2,000 per month.');
  const [budget, setBudget] = useState('2000');
  const [seats, setSeats] = useState('5');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('balanced');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      message,
      budgetInr: Number(budget),
      seats: Number(seats),
      category,
      priority,
    });
  }

  const fieldClass = 'mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/20';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/10">
      <div>
        <label htmlFor="copilot-request" className="block text-sm font-semibold text-slate-100">Tell the copilot what your team is trying to solve</label>
        <textarea
          id="copilot-request"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={350}
          placeholder="Describe the workflow, pain point, or outcome you need."
          className={`${fieldClass} resize-y`}
          required
          minLength={5}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => setMessage(example)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-left text-xs text-slate-400 transition hover:border-emerald-300/30 hover:text-emerald-100"
            >
              {['Project team', 'Sales team', 'Remote team'][index]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-semibold text-slate-400">
          Need category
          <select value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}>
            <option value="">Copilot decides</option>
            {PRODUCT_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-400">
          Team seats
          <input
            type="number"
            min="1"
            max="1000"
            value={seats}
            onChange={(event) => setSeats(event.target.value)}
            className={fieldClass}
            required
          />
        </label>
        <label className="block text-xs font-semibold text-slate-400">
          Monthly budget · INR
          <input
            type="number"
            min="1"
            max="100000"
            step="0.01"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            className={fieldClass}
            required
          />
        </label>
        <label className="block text-xs font-semibold text-slate-400">
          Buying priority
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className={fieldClass}>
            <option value="balanced">Balanced value</option>
            <option value="lowest-cost">Lowest cost</option>
            <option value="features">Most capabilities</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">The agent searches the catalog. You review and approve before checkout.</p>
        <button
          type="submit"
          disabled={loading || message.trim().length < 5 || Number(seats) < 1 || Number(seats) > 1000 || Number(budget) <= 0 || Number(budget) > 100000}
          className="cursor-pointer rounded-xl bg-emerald-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Get recommendations'}
        </button>
      </div>
    </form>
  );
}