export default function StatCard({ title, value, description }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <h3 className="mt-3 text-2xl font-bold">{value}</h3>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  );
}