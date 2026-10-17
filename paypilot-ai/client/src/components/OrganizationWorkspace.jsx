import { useEffect, useState } from 'react';
import {
  askPolicyQuestion, getBudgets, getInvoices, getOrganizationSettings,
  inviteMember, saveBudget, updateOrganizationSettings, uploadInvoice,
  cancelSubscription, getSubscriptions, updateInvoiceStatus,
} from '../services/api.js';
import { formatMoney } from '../services/api.js';
import { useAuth } from '../context/useAuth.js';

const fieldClass = 'w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/40';

export default function OrganizationWorkspace() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [members, setMembers] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [settings, setSettings] = useState({});
  const [budgetForm, setBudgetForm] = useState({ department: 'General', category: 'all', amount: '10000' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'employee', department: 'General' });
  const [invitationLink, setInvitationLink] = useState('');
  const [policyQuestion, setPolicyQuestion] = useState('');
  const [policyAnswer, setPolicyAnswer] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let ignore = false;
    Promise.all([
      getInvoices(),
      getSubscriptions(),
      isAdmin ? getBudgets() : Promise.resolve({ budgets: [] }),
      isAdmin ? getOrganizationSettings() : Promise.resolve(null),
    ]).then(([invoiceData, subscriptionData, budgetData, organizationData]) => {
      if (ignore) return;
      setInvoices(invoiceData.invoices ?? []);
      setSubscriptions(subscriptionData.subscriptions ?? []);
      setBudgets(budgetData.budgets ?? []);
      if (organizationData) {
        const org = organizationData.organization;
        setOrganization(org);
        setMembers(organizationData.members ?? []);
        setSettings({
          name: org.name,
          financeApprovalThresholdRupees: org.financeApprovalThresholdCents / 100,
          budgetAlertPercent: org.budgetAlertPercent,
          departments: (org.departments ?? ['General']).join(', '),
          policyText: org.policyText ?? '',
        });
        setBudgetForm((current) => ({ ...current, department: org.departments?.[0] ?? 'General' }));
      }
    }).catch((err) => {
      if (!ignore) setError(err.message || 'Could not load organization workspace.');
    });
    return () => { ignore = true; };
  }, [isAdmin]);

  async function saveSettings(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const response = await updateOrganizationSettings({
        name: settings.name,
        financeApprovalThresholdCents: Math.round(Number(settings.financeApprovalThresholdRupees) * 100),
        budgetAlertPercent: Number(settings.budgetAlertPercent),
        departments: settings.departments.split(',').map((item) => item.trim()).filter(Boolean),
        policyText: settings.policyText,
      });
      setOrganization(response.organization);
      setNotice('Organization settings saved.');
    } catch (err) { setError(err.message || 'Could not save settings.'); }
    finally { setBusy(false); }
  }

  async function createBudget(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveBudget({
        department: budgetForm.department,
        category: budgetForm.category,
        amountCents: Math.round(Number(budgetForm.amount) * 100),
        currency: 'INR',
      });
      const response = await getBudgets();
      setBudgets(response.budgets ?? []);
      setNotice('Monthly department budget saved.');
    } catch (err) { setError(err.message || 'Could not save budget.'); }
    finally { setBusy(false); }
  }

  async function createInvite(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInvitationLink('');
    try {
      const response = await inviteMember(inviteForm);
      const params = new URLSearchParams({ invite: response.invitation.token, email: response.invitation.email });
      setInvitationLink(`${window.location.origin}${window.location.pathname}?${params.toString()}`);
      setNotice(`Invitation created. Share the one-time link with ${response.invitation.email}; it expires in 7 days.`);
      setInviteForm((current) => ({ ...current, email: '' }));
    } catch (err) { setError(err.message || 'Could not create invitation.'); }
    finally { setBusy(false); }
  }

  async function askPolicy(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { setPolicyAnswer(await askPolicyQuestion(policyQuestion)); }
    catch (err) { setError(err.message || 'Could not search approved policy text.'); }
    finally { setBusy(false); }
  }

  async function processInvoice(event) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !['application/pdf', 'text/plain'].includes(file.type)) {
      setError('Choose a PDF or plain-text file no larger than 5 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await uploadInvoice(file);
      setInvoices((current) => [result.invoice, ...current]);
      setNotice('Invoice fields extracted locally. Review every field before using it.');
      setFile(null);
      event.currentTarget.reset();
    } catch (err) { setError(err.message || 'Could not process invoice.'); }
    finally { setBusy(false); }
  }

  async function cancelRenewal(subscriptionId) {
    setBusy(true);
    setError('');
    try {
      await cancelSubscription(subscriptionId);
      setSubscriptions((current) => current.map((item) => item._id === subscriptionId ? { ...item, status: 'cancelled' } : item));
      setNotice('Subscription marked cancelled in the renewal tracker.');
    } catch (err) { setError(err.message || 'Could not update subscription status.'); }
    finally { setBusy(false); }
  }

  async function reviewInvoice(invoiceId) {
    setBusy(true);
    setError('');
    try {
      const response = await updateInvoiceStatus(invoiceId, 'matched');
      setInvoices((current) => current.map((item) => item._id === invoiceId ? response.invoice : item));
      setNotice('Invoice marked matched after human review.');
    } catch (err) { setError(err.message || 'Could not update invoice review status.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 sm:p-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Workspace controls</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{isAdmin ? 'Organization, policy & invoices' : 'Documents & subscriptions'}</h2>
        <p className="mt-1 text-sm text-slate-400">Invoice files are processed on this server only. Extracted values always need human review.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-300/6 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-300/20 bg-emerald-300/6 p-3 text-sm text-emerald-100">{notice}</p>}

      {isAdmin && organization && <>
        <form onSubmit={saveSettings} className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4 sm:grid-cols-2">
          <h3 className="font-semibold text-white sm:col-span-2">Organization settings</h3>
          <label className="space-y-1 text-xs text-slate-400">Name<input className={fieldClass} value={settings.name ?? ''} onChange={(event) => setSettings({ ...settings, name: event.target.value })} required maxLength={100} /></label>
          <label className="space-y-1 text-xs text-slate-400">Finance approval above · INR<input className={fieldClass} type="number" min="0" step="0.01" value={settings.financeApprovalThresholdRupees ?? ''} onChange={(event) => setSettings({ ...settings, financeApprovalThresholdRupees: event.target.value })} required /></label>
          <label className="space-y-1 text-xs text-slate-400">Budget alert threshold · %<input className={fieldClass} type="number" min="1" max="100" value={settings.budgetAlertPercent ?? 80} onChange={(event) => setSettings({ ...settings, budgetAlertPercent: event.target.value })} required /></label>
          <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Departments (comma-separated)<input className={fieldClass} value={settings.departments ?? ''} onChange={(event) => setSettings({ ...settings, departments: event.target.value })} maxLength={4000} required /></label>
          <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Approved purchasing policy<textarea className={fieldClass} rows={5} value={settings.policyText ?? ''} onChange={(event) => setSettings({ ...settings, policyText: event.target.value })} maxLength={20000} /></label>
          <button disabled={busy} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50 sm:col-span-2">{busy ? 'Saving…' : 'Save organization settings'}</button>
        </form>

        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={createBudget} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <h3 className="font-semibold text-white">Monthly department allocation</h3>
            <label className="block space-y-1 text-xs text-slate-400">Department<select className={fieldClass} value={budgetForm.department} onChange={(event) => setBudgetForm({ ...budgetForm, department: event.target.value })}>{(organization.departments ?? ['General']).map((department) => <option key={department}>{department}</option>)}</select></label>
            <label className="block space-y-1 text-xs text-slate-400">Monthly budget · INR<input className={fieldClass} type="number" min="0" step="0.01" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })} required /></label>
            <button disabled={busy} className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50">Save budget</button>
            <ul className="space-y-1 text-xs text-slate-400">{budgets.map((budget) => <li key={budget._id}>{budget.department} · {budget.category} · {formatMoney(budget.amountCents, budget.currency)}/month</li>)}</ul>
          </form>
          <form onSubmit={createInvite} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <h3 className="font-semibold text-white">Invite a workspace member</h3>
            <input className={fieldClass} type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="colleague@company.com" required />
            <div className="grid grid-cols-2 gap-2">
              <select className={fieldClass} value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}><option value="employee">Employee</option><option value="manager">Manager</option><option value="finance">Finance</option></select>
              <select className={fieldClass} value={inviteForm.department} onChange={(event) => setInviteForm({ ...inviteForm, department: event.target.value })}>{(organization.departments ?? ['General']).map((department) => <option key={department}>{department}</option>)}</select>
            </div>
            <button disabled={busy} className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50">Create invite link</button>
            {invitationLink && <label className="block space-y-1 text-xs text-slate-400">One-time invitation link<input readOnly className={fieldClass} value={invitationLink} onFocus={(event) => event.target.select()} /></label>}
            <ul className="space-y-1 text-xs text-slate-400">{members.map((member) => <li key={member._id}>{member.name} · {member.email} · {member.role} · {member.department}</li>)}</ul>
          </form>
        </div>
      </>}

      {isAdmin && <form onSubmit={askPolicy} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <h3 className="font-semibold text-white">Ask approved policy (local text search)</h3>
        <div className="flex flex-wrap gap-2"><input className={`${fieldClass} min-w-60 flex-1`} value={policyQuestion} onChange={(event) => setPolicyQuestion(event.target.value)} minLength={5} maxLength={1000} placeholder="What approvals are required for a software subscription?" required /><button disabled={busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold disabled:opacity-50">Ask</button></div>
        {policyAnswer && <div className="space-y-2 text-sm text-slate-300"><p>{policyAnswer.answer}</p>{policyAnswer.evidence?.map((line) => <blockquote key={line} className="border-l-2 border-emerald-300/40 pl-3 text-xs text-slate-400">{line}</blockquote>)}</div>}
      </form>}

      <section className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <h3 className="font-semibold text-white">Subscription renewal tracker</h3>
        {subscriptions.length === 0 ? <p className="text-xs text-slate-400">Verified purchases create monthly renewal reminders here.</p>
          : <ul className="space-y-2">{subscriptions.map((subscription) => <li key={subscription._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 p-3 text-xs text-slate-300">
            <span>{subscription.productName} · {formatMoney(subscription.amountCents, subscription.currency)}/month · renews {new Date(subscription.renewalDate).toLocaleDateString()} · {subscription.status}{subscription.user?.name ? ` · ${subscription.user.name}` : ''}</span>
            {subscription.status === 'active' && <button type="button" onClick={() => cancelRenewal(subscription._id)} disabled={busy} className="rounded-lg border border-amber-200/20 px-2.5 py-1.5 text-amber-100 disabled:opacity-50">Mark cancelled</button>}
          </li>)}</ul>}
      </section>

      <form onSubmit={processInvoice} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
        <h3 className="font-semibold text-white">Extract invoice fields · local-only</h3>
        <p className="text-xs text-slate-400">PDF or .txt, up to 5 MB. No third-party AI service receives these documents.</p>
        <div className="flex flex-wrap items-center gap-3"><input type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="max-w-full text-xs text-slate-300" /><button disabled={busy || !file} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? 'Processing…' : 'Extract locally'}</button></div>
        <ul className="space-y-2">{invoices.map((invoice) => <li key={invoice._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 p-3 text-xs text-slate-300"><span><strong>{invoice.filename}</strong> · {invoice.vendor || 'Vendor needs review'} · {invoice.amountCents == null ? 'Amount needs review' : formatMoney(invoice.amountCents, invoice.currency)} · {invoice.invoiceNumber || 'Invoice number needs review'} · {invoice.status}</span>{invoice.status === 'needs_review' && ['admin', 'finance'].includes(user?.role) && <button type="button" onClick={() => reviewInvoice(invoice._id)} disabled={busy} className="rounded-lg border border-emerald-300/20 px-2 py-1.5 text-emerald-100 disabled:opacity-50">Mark matched</button>}</li>)}</ul>
      </form>
    </section>
  );
}
