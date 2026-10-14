import { useEffect, useState } from "react";
import { Bot, CreditCard, ShieldCheck } from "lucide-react";
import StatCard from "../components/StatCard";
import ProductCatalog from "../components/ProductCatalog";
import api from "../services/api";

export default function Dashboard() {
  const [apiStatus, setApiStatus] = useState("Checking...");

  useEffect(() => {
    let active = true;

    api.get("/health")
      .then(({ data }) => {
        if (active) {
          setApiStatus(
            data.status === "ok" || data.success === true
              ? "Connected"
              : "Disconnected"
          );
        }
      })
      .catch(() => {
        if (active) setApiStatus("Disconnected");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
      <main className="min-w-0 flex-1 p-5 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-violet-400">OVERVIEW</p>
            <h2 className="mt-2 text-3xl font-bold">Dashboard</h2>
            <p className="mt-2 text-sm text-slate-400">
              Your AI-powered commerce workspace.
            </p>
          </div>

          <div className="rounded-full border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300">
            Sandbox mode
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="AI Assistant"
            value="Ready to build"
            description="Product recommendations coming next"
          />
          <StatCard
            title="Transactions"
            value="0"
            description="No payments recorded yet"
          />
          <StatCard
            title="Backend status"
            value={apiStatus}
            description="Express API health check"
          />
        </section>

        <section className="mt-8 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/70 to-slate-900 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Bot className="text-violet-300" size={28} />
            <p className="text-sm font-medium text-violet-300">
              YOUR AI COMMERCE AGENT
            </p>
          </div>

          <h3 className="mt-5 max-w-xl text-2xl font-bold sm:text-3xl">
            Smarter purchase decisions. Human-approved payments.
          </h3>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            Describe what you need. PayPilot will help compare products,
            explain recommendations and prepare a secure checkout.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
              <ShieldCheck size={17} />
              Human approval
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
              <CreditCard size={17} />
              PayPal checkout
            </div>
          </div>
        </section>

        <ProductCatalog />
      </main>
  );
}