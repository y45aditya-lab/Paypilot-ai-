import { useState } from 'react';
import { ArrowUpRight, Boxes, BrainCircuit, ChartNoAxesCombined, ClipboardCheck, Cog, FileText, ReceiptText, Store } from 'lucide-react';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import PurchaseAssistant from './PurchaseAssistant.jsx';
import ProductCatalog from './ProductCatalog.jsx';
import StackPlanner from './StackPlanner.jsx';
import TransactionHistory from './TransactionHistory.jsx';
import InventoryVendors from './InventoryVendors.jsx';
import PurchaseRequests from './PurchaseRequests.jsx';
import OrganizationWorkspace from './OrganizationWorkspace.jsx';
import { useAuth } from '../context/useAuth.js';

const TABS = [
  { id: 'assistant', label: 'AI copilot', icon: BrainCircuit },
  { id: 'planner', label: 'Stack optimizer', icon: Boxes },
  { id: 'catalog', label: 'Marketplace', icon: ArrowUpRight },
  { id: 'history', label: 'Activity', icon: ReceiptText },
  { id: 'requests', label: 'Requests & approvals', icon: ClipboardCheck },
  { id: 'analytics', label: 'Analytics & risk', icon: ChartNoAxesCombined },
];

export default function Dashboard() {
  const [tab, setTab] = useState('assistant');
  const { user } = useAuth();
  const tabs = user?.role === 'admin'
    ? [...TABS, { id: 'inventory', label: 'Vendors & inventory', icon: Store }, { id: 'workspace', label: 'Organization', icon: Cog }]
    : ['finance', 'manager'].includes(user?.role)
      ? [...TABS, { id: 'workspace', label: 'Documents & policy', icon: FileText }]
      : TABS;
  return (
    <div className="space-y-7">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/70 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_2px_rgba(110,231,183,0.55)]" />
              PayPilot · Procurement intelligence
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Spend with a strategy.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Compare real catalog options, optimize a complete software stack against your budget,
              and keep every purchase under human approval.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace mode</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Sandbox · No real charges
              </p>
            </div>
            <NotificationCenter />
          </div>
        </div>
      </header>

      <div className="space-y-5">
        <nav aria-label="Workspace sections" className="flex gap-1 overflow-x-auto border-b border-white/10">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
                tab === id ? 'border-emerald-300 text-emerald-200' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <section>
          {tab === 'assistant' && <PurchaseAssistant onViewHistory={() => setTab('history')} />}
          {tab === 'planner' && <StackPlanner />}
          {tab === 'catalog' && <ProductCatalog />}
          {tab === 'history' && <TransactionHistory />}
          {tab === 'requests' && <PurchaseRequests />}
          {tab === 'analytics' && <AnalyticsDashboard />}
          {tab === 'inventory' && user?.role === 'admin' && <InventoryVendors />}
          {tab === 'workspace' && ['admin', 'finance', 'manager'].includes(user?.role) && <OrganizationWorkspace />}
        </section>
      </div>
    </div>
  );
}