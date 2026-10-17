import Header from './components/Header.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Dashboard from './components/Dashboard.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#090e18] text-slate-100">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
