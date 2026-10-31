import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canOpen, ROLES } from '../lib/calc.js';
import { Icon } from './ui.jsx';

export const NAV = [
  ['Overview', [['dashboard', 'Management Dashboard', 'dashboard']]],
  ['Sales', [
    ['pos', 'Point of Sale', 'pos'], ['sales', 'Invoices', 'invoice'], ['customers', 'Customers', 'users'],
    ['collections', 'Credit & Collections', 'wallet'], ['pricelists', 'Pricelists & Offers', 'tag'],
  ]],
  ['Inventory', [
    ['products', 'Products & Units', 'box'], ['inventory', 'Stock & Cycle Count', 'layers'], ['warehouse', 'Warehouse Orders', 'truck'],
  ]],
  ['Purchase', [['purchase', 'Purchase & Landed Cost', 'cart']]],
  ['Control', [['reports', 'Reports & Analytics', 'chart'], ['security', 'Security Dashboard', 'shield'], ['audit', 'Audit Trail', 'history']]],
  ['Administration', [['users', 'Users & Roles', 'user'], ['settings', 'Settings', 'settings']]],
];

// Modules scheduled for later phases; shown so the client sees the full roadmap.
const SOON = [['HR & Self-Service', 'briefcase'], ['Leads & Loyalty', 'gift'], ['Bank Reconciliation', 'bank'], ['Bill Scan (OCR)', 'scan']];

export const TITLES = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([k, t]) => [k, t])));

export function Layout({ page, children }) {
  const { user, db, logout } = useStore();
  const [open, setOpen] = useState(false);
  const go = (k) => { location.hash = '/' + k; setOpen(false); };
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const extra = { users: 'owner', settings: 'owner' };

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-logo">S</div>
            <div><div className="brand-name">{db.company.name}</div><div className="brand-sub">Enterprise Suite</div></div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(([group, items]) => {
            const visible = items.filter(([k]) => (extra[k] ? user.role === extra[k] : canOpen(user.role, k)));
            if (!visible.length) return null;
            return (
              <div key={group}>
                <div className="nav-group">{group}</div>
                {visible.map(([k, label, icon]) => (
                  <button key={k} className={`nav-link ${page === k ? 'active' : ''}`} onClick={() => go(k)}>
                    <Icon name={icon} />{label}
                  </button>
                ))}
              </div>
            );
          })}
          {user.role === 'owner' && (
            <div>
              <div className="nav-group">Next phase</div>
              {SOON.map(([label, icon]) => (
                <div key={label} className="nav-link soon" title="Scheduled for the next release"><Icon name={icon} />{label}<span className="tag">Soon</span></div>
              ))}
            </div>
          )}
        </nav>
        <div className="sidebar-foot">Developed by DTA · v0.1</div>
      </aside>
      {open && <div className="backdrop" style={{ zIndex: 25 }} onClick={() => setOpen(false)} />}
      <main className="main">
        <header className="topbar">
          <button className="btn ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
          <div className="crumb">{db.company.name} / <b>{TITLES[page]}</b></div>
          <div className="spacer" />
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="who"><b>{user.name}</b><span>{ROLES[user.role]}</span></div>
            <button className="btn ghost icon-btn" onClick={logout} title="Log out" aria-label="Log out"><Icon name="logout" /></button>
          </div>
        </header>
        <div className="content" key={page}>{children}</div>
      </main>
    </div>
  );
}
