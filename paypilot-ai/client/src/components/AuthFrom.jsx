import { useState } from 'react';
import { useAuth } from '../context/useAuth.js';

export default function AuthForm() {
  const { login, signup, acceptInvite } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite') ?? '';
  const [mode, setMode] = useState(inviteToken ? 'invite' : 'login');
  const [form, setForm] = useState({
    name: '', organizationName: '', email: params.get('email') ?? '', password: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm((current) => ({ ...current, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') await signup(form);
      else if (mode === 'invite') await acceptInvite({ ...form, inviteToken });
      else await login({ email: form.email, password: form.password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10';

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-5 rounded-3xl border border-white/70 bg-white p-7 text-slate-900 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] sm:p-9">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Secure workspace access</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{mode === 'login' ? 'Welcome back' : mode === 'invite' ? 'Join your workspace' : 'Create your account'}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'login' ? 'Sign in to continue to your procurement workspace.' : mode === 'invite' ? 'Accept your organization invitation to join its procurement workspace.' : 'Set up your workspace to start planning smarter purchases.'}
        </p>
      </div>

      {mode !== 'login' && (
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Full name
          <input className={input} autoComplete="name" placeholder="Your name" value={form.name} onChange={set('name')} required />
        </label>
      )}
      {mode === 'signup' && (
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Organization
          <input className={input} autoComplete="organization" placeholder="Your company or team" value={form.organizationName} onChange={set('organizationName')} minLength={2} maxLength={100} required />
        </label>
      )}
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Email address
        <input className={input} type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={set('email')} readOnly={mode === 'invite'} required />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Password
        <input
          className={input}
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="At least 8 characters"
          value={form.password}
          onChange={set('password')}
          minLength={8}
          required
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50"
      >
        {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : mode === 'invite' ? 'Accept invitation' : 'Sign up'}
      </button>

      {mode !== 'invite' && <button
        type="button"
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
        className="w-full text-sm font-medium text-slate-600 transition hover:text-emerald-700"
      >
        {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
      </button>}
    </form>
  );
}