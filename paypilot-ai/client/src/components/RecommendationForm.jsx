import { useState } from 'react';

export default function RecommendationForm({ onSubmit, loading }) {
  const [message, setMessage] = useState('');
  const [budget, setBudget] = useState('100');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ message, budgetUsd: Number(budget) });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium">What do you need?</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="I need a project management subscription for a team of five."
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Monthly budget (USD)</label>
        <input
          type="number"
          min="1"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="w-40 rounded-lg border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading || message.trim().length < 5}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Finding the best option...' : 'Get recommendation'}
      </button>
    </form>
  );
}