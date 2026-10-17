import { useAuth } from '../context/useAuth.js';

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090e18]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300 text-sm font-black text-slate-950">P</div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white">PAYPILOT</h1>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">AI procurement</p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <p className="font-medium text-slate-200">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <button type="button" onClick={logout} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}