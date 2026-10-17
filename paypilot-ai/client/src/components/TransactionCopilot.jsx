import { useState } from 'react';
import { askTransactionCopilot } from '../services/api.js';

const EXAMPLE_QUESTIONS = [
  'How much did I spend in the last 90 days?',
  'Which products had refunds?',
  'Do my recent purchases show any review signals?',
];

export default function TransactionCopilot() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setAnswer(null);
    try {
      setAnswer(await askTransactionCopilot(question));
    } catch (err) {
      setError(err.message || 'Could not answer from transaction records.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-violet-300/15 bg-slate-900/80 p-5 shadow-xl shadow-black/10">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">Transaction-grounded AI</p>
        <h2 className="mt-1 text-lg font-bold text-white">Ask about your account activity</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">Answers are limited to your own verified transactions from the last 90 days. The question and minimized transaction data are sent to the configured AI provider; payment identifiers are excluded.</p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 grow">
          <span className="sr-only">Ask about your transactions</span>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} minLength={5} required placeholder="Ask about spending, refunds, or purchase patterns…" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-300/50" />
        </label>
        <button type="submit" disabled={loading || question.trim().length < 5} className="rounded-xl bg-violet-300 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-violet-200 disabled:opacity-50">{loading ? 'Analyzing…' : 'Ask copilot'}</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button key={example} type="button" onClick={() => setQuestion(example)} className="rounded-full border border-white/10 px-3 py-1.5 text-left text-xs text-slate-400 hover:border-violet-300/30 hover:text-violet-100">{example}</button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-300/15 bg-red-300/6 p-3 text-sm text-red-200">{error}</p>}
      {answer && (
        <div className="rounded-xl border border-violet-300/10 bg-violet-300/5 p-4" aria-live="polite">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${answer.mode === 'ai-assisted' ? 'border-violet-300/20 bg-violet-300/10 text-violet-100' : 'border-emerald-300/15 bg-emerald-300/6 text-emerald-100'}`}>
            {answer.mode === 'ai-assisted' ? 'AI · grounded in your records' : 'Verified-record answer'}
          </span>
          <p className="text-sm leading-6 text-slate-200">{answer.answer}</p>
          {answer.notice && <p className="mt-3 rounded-lg border border-amber-300/10 bg-amber-300/4 px-3 py-2 text-xs text-amber-100">{answer.notice}</p>}
          <p className="mt-3 text-[10px] text-slate-500">Grounded in {answer.basedOn.recentRecordsIncluded} recent record(s) · 90 days · verify figures in Analytics</p>
        </div>
      )}
    </section>
  );
}
