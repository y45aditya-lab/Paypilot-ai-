import { useAuth } from '../context/useAuth.js';
import AuthForm from './AuthFrom.jsx';

// Shows children only when signed in; otherwise the login form.
export default function RequireAuth({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <p className="text-center text-sm text-slate-500">Loading...</p>;
  return user ? children : <AuthForm />;
}