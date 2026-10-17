import { useEffect, useState } from 'react';
import * as api from '../services/api.js';
import { AuthContext } from './authContext.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // The refresh cookie is httpOnly, so JS can't tell if one exists. We always ask the server once.
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    try { localStorage.removeItem('paypilot_token'); } catch { /* old Day 3 token: clean it up */ }

    api.setUnauthorizedHandler(() => { api.setAccessToken(null); setUser(null); });

    let ignore = false;
    api.refreshSession()
      .then((session) => { if (!ignore && session) setUser(session.user); })
      .finally(() => { if (!ignore) setBooting(false); });
    return () => { ignore = true; };
  }, []);

  async function authenticate(fn, payload) {
    const { accessToken, user } = await fn(payload);
    api.setAccessToken(accessToken);
    setUser(user);
  }

  async function logout() {
    try { await api.logout(); } catch { /* clear locally either way */ }
    api.setAccessToken(null);
    setUser(null);
  }

  const value = {
    user, booting, logout,
    login: (payload) => authenticate(api.login, payload),
    signup: (payload) => authenticate(api.signup, payload),
    acceptInvite: (payload) => authenticate(api.acceptInvite, payload),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>; 
}

