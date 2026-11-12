import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { FormModal } from './components.jsx';
import { ACTIONS, FORMS } from './forms.jsx';
import { AppContext, api, localDay } from './lib.js';
import Dashboard from './pages/Dashboard.jsx';
import { Exchange, Money as MoneyPage, Transfers } from './pages/Operations.jsx';
import Debts from './pages/Debts.jsx';
import Rentals from './pages/Rentals.jsx';
import { Account, Accounts } from './pages/Accounts.jsx';
import { Customer, Customers } from './pages/Customers.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

const icon = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const NAV = [
  ['/', 'Dashboard', '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'],
  [null, 'Business'],
  ['/transfers', 'Transfers', '<path d="M4 8h14l-4-4M20 16H6l4 4"/>'],
  ['/exchange', 'Exchange', '<circle cx="8" cy="8" r="5"/><circle cx="16" cy="16" r="5"/>'],
  ['/debts', 'Debts', '<path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'],
  ['/rentals', 'Rentals', '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'],
  ['/money', 'Income & expenses', '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'],
  [null, 'Records'],
  ['/accounts', 'Accounts', '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>'],
  ['/customers', 'Customers', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
  ['/reports', 'Reports', '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>'],
  ['/settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'],
];
const Logo = () => (
  <div className="logo">
    <svg width="22" height="22" viewBox="0 0 32 32"><path d="M8 24 16 7l8 17M11.5 18h9" fill="none" stroke="#e9c46a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </div>
);
const Brand = () => <div className="brand"><Logo /><div><b>ETS AMANI</b><small>Business manager</small></div></div>;

function AuthScreen({ setup, onDone }) {
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    try {
      if (setup) await api('POST', '/setup', v);
      await api('POST', '/login', v);
      onDone();
    } catch (ex) { setError(ex.message); }
  };
  return (
    <div className="auth">
      <form className="box" onSubmit={submit}>
        <Brand />
        <h2>{setup ? 'Create the owner account' : 'Sign in'}</h2>
        <p>{setup ? 'First start: choose the username and password of the owner.' : 'Enter your username and password.'}</p>
        {error && <div className="err">{error}</div>}
        <div className="f"><label>Username</label><input name="username" required autoComplete="username" autoFocus /></div>
        <div className="f"><label>Password</label><input name="password" type="password" required autoComplete={setup ? 'new-password' : 'current-password'} /></div>
        <button className="btn primary">{setup ? 'Create and start' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);       // { setup, user } from the server
  const [S, setS] = useState(null);         // full state once signed in
  const [form, setForm] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [menu, setMenu] = useState(false);
  const toastTimer = useRef();
  const location = useLocation();

  const toast = useCallback((text, bad) => {
    setToastMsg({ text, bad });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);
  const refresh = useCallback(async () => setS(await api('GET', '/state?today=' + localDay())), []);
  const boot = useCallback(async () => {
    setS(null); setForm(null);
    const m = await api('GET', '/me');
    setMe(m);
    if (m.user) await refresh();
  }, [refresh]);

  useEffect(() => { boot().catch((e) => toast(e.message, true)); }, [boot, toast]);
  useEffect(() => {
    const out = () => { setS(null); setMe((m) => m && { ...m, user: null }); };
    window.addEventListener('signed-out', out);
    return () => window.removeEventListener('signed-out', out);
  }, []);
  useEffect(() => { setMenu(false); }, [location]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && setForm(null);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);

  const ctx = useMemo(() => S && {
    S, refresh, toast, isOwner: S.user.role === 'owner',
    /** Start an operation by name: open its form, or run its action. */
    async run(name, args = {}) {
      try {
        if (FORMS[name]) return setForm(FORMS[name](S, args));
        const message = await ACTIONS[name](S, args);
        if (message) { toast(message); await refresh(); }
      } catch (e) { toast(e.message, true); }
    },
  }, [S, refresh, toast]);

  const toastEl = <div className={`toast ${toastMsg ? 'show' : ''} ${toastMsg?.bad ? 'bad' : ''}`}>{toastMsg?.text}</div>;
  if (!me) return toastEl;
  if (!me.user) return <><AuthScreen setup={me.setup} onDone={boot} />{toastEl}</>;
  if (!S) return toastEl;

  const logout = async () => { await api('POST', '/logout'); boot(); };
  return (
    <AppContext.Provider value={ctx}>
      <div className={`shell ${ctx.isOwner ? '' : 'viewer'} ${menu ? 'menu-open' : ''}`}>
        <aside className="side">
          <Brand />
          <nav className="nav">
            {NAV.map(([to, label, d]) => (to
              ? <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>{icon(d)}{label}</NavLink>
              : <div key={label} className="sep">{label}</div>))}
          </nav>
          <div className="who">
            <div className="av">{S.user.username[0]}</div>
            <div><b style={{ color: '#fff' }}>{S.user.username}</b><br /><span style={{ fontSize: 11.5 }}>{ctx.isOwner ? 'Owner' : 'View only'}</span></div>
            <button onClick={logout}>Sign out</button>
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/exchange" element={<Exchange />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="/rentals" element={<Rentals />} />
            <Route path="/money" element={<MoneyPage />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/:id" element={<Account />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<Customer />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <button className="burger" onClick={() => setMenu((m) => !m)} aria-label="Menu">☰</button>
      </div>
      {form && (
        <FormModal config={form} onClose={() => setForm(null)}
          onDone={async (message) => { setForm(null); toast(message); await refresh(); }} />
      )}
      {toastEl}
    </AppContext.Provider>
  );
}
