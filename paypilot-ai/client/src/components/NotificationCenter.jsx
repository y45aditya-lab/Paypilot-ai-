import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { getNotifications, markNotificationRead, updateNotificationPreferences } from '../services/api.js';
import { useAuth } from '../context/useAuth.js';

const SEVERITY_CLASS = {
  info: 'border-white/10',
  medium: 'border-amber-300/20',
  high: 'border-red-300/20',
};

export default function NotificationCenter() {
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [preferences, setPreferences] = useState(user?.notificationPreferences ?? {});
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [savingPreference, setSavingPreference] = useState('');

  async function load() {
    try {
      setData(await getNotifications());
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load notifications.');
    }
  }

  useEffect(() => {
    let ignore = false;
    getNotifications()
      .then((result) => { if (!ignore) setData(result); })
      .catch((err) => { if (!ignore) setError(err.message || 'Could not load notifications.'); });
    return () => { ignore = true; };
  }, []);

  async function markRead(item) {
    try {
      await markNotificationRead(item._id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update notification.');
    }
  }

  async function changePreference(field, value) {
    setSavingPreference(field);
    setError('');
    try {
      const response = await updateNotificationPreferences({ [field]: value });
      setPreferences(response.notificationPreferences);
    } catch (err) {
      setError(err.message || 'Could not save notification preference.');
    } finally {
      setSavingPreference('');
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen((value) => !value); if (!open) load(); }} aria-expanded={open} aria-label={`Notifications, ${data.unread} unread`} className="relative rounded-xl border border-white/10 bg-black/20 p-3 text-slate-200 hover:border-emerald-300/30">
        <Bell size={18} aria-hidden="true" />
        {data.unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-300 px-1 text-center text-[10px] font-bold leading-5 text-slate-950">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <section className="absolute right-0 z-20 mt-2 w-[min(90vw,24rem)] rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl" aria-label="Notifications">
          <header className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Notifications</h2>
              <p className="text-xs text-slate-500">{data.unread} unread · latest 30</p>
            </div>
            <button type="button" onClick={load} className="text-xs text-emerald-200 underline underline-offset-4">Refresh</button>
          </header>
          <details className="mt-3 rounded-lg border border-white/10 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">Notification preferences</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
              {[
                ['approvals', 'Approvals'],
                ['payment', 'Payments & refunds'],
                ['budget', 'Budgets & renewals'],
                ['risk', 'Review signals'],
                ['email', 'Email delivery'],
              ].map(([field, title]) => (
                <label key={field} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferences[field] !== false}
                    disabled={savingPreference === field}
                    onChange={(event) => changePreference(field, event.target.checked)}
                  />
                  {title}
                </label>
              ))}
            </div>
          </details>
          {error && <p role="alert" className="mt-3 text-xs text-red-200">{error}</p>}
          {data.items.length === 0
            ? <p className="py-8 text-center text-sm text-slate-500">You’re all caught up.</p>
            : <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
              {data.items.map((item) => (
                <li key={item._id} className={`rounded-xl border ${SEVERITY_CLASS[item.severity] ?? SEVERITY_CLASS.info} ${item.readAt ? 'opacity-60' : 'bg-white/3'} p-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">{item.message}</p>
                      <time className="mt-2 block text-[10px] text-slate-600">{new Date(item.createdAt).toLocaleString()}</time>
                    </div>
                    {!item.readAt && <button type="button" onClick={() => markRead(item)} className="shrink-0 text-xs text-emerald-200 underline underline-offset-4">Mark read</button>}
                  </div>
                </li>
              ))}
            </ul>}
        </section>
      )}
    </div>
  );
}
