import { Wallet, LayoutDashboard, ShoppingBag } from "lucide-react";

const pages = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "checkout", label: "Checkout", Icon: ShoppingBag },
];

export default function Navbar({ currentPage, onNavigate }) {
  return (
    <aside className="w-full border-b border-white/10 bg-slate-950 p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-600 p-2">
          <Wallet size={23} />
        </div>

        <div>
          <h1 className="text-lg font-bold">PayPilot AI</h1>
          <p className="text-xs text-slate-400">Intelligent commerce</p>
        </div>
      </div>

      <nav className="mt-8 flex gap-3 md:flex-col">
        {pages.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={currentPage === id ? "page" : undefined}
            onClick={() => onNavigate(id)}
            className={`flex items-center gap-3 rounded-lg p-3 text-left ${
              currentPage === id
                ? "bg-violet-500/15 text-violet-300"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <p className="mt-8 text-xs text-slate-500">
        Development · Sandbox
      </p>
    </aside>
  );
}