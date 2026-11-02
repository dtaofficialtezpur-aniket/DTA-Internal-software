import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canOpen, ROLES } from '../lib/calc.js';
import { Icon } from './ui.jsx';
import { GlobalSearch, QuickCreate } from './TopTools.jsx';
import { NAV_COLORS, SECTION_COLORS } from '../lib/iconColors.js';

// Top-level links, then collapsible sections: [section, icon, items].
const TOP = [['dashboard', 'Management Dashboard', 'dashboard'], ['crmhome', 'CRM Home', 'home'], ['analytics', 'Analytics', 'chart'], ['me', 'My Portal', 'clock']];
export const NAV = [
  ['CRM Sales', 'target', [['leads', 'Leads', 'target'], ['contacts', 'Contacts', 'user'], ['accounts', 'Accounts', 'bank'],
    ['deals', 'Deals', 'briefcase'], ['forecasts', 'Forecasts', 'trend'], ['campaigns', 'Campaigns', 'gift']]],
  ['Activities', 'calendar', [['tasks', 'Tasks', 'check'], ['meetings', 'Meetings', 'clock'], ['calls', 'Calls', 'phone']]],
  ['Billing & Sales', 'pos', [['pos', 'Point of Sale', 'pos'], ['sales', 'Invoices', 'invoice'], ['customers', 'Customers', 'users'],
    ['collections', 'Credit & Collections', 'wallet'], ['pricelists', 'Pricelists & Offers', 'tag'], ['crm', 'Loyalty Programme', 'gift']]],
  ['Inventory', 'box', [['products', 'Products & Units', 'box'], ['inventory', 'Stock & Cycle Count', 'layers'], ['warehouse', 'Warehouse Orders', 'truck']]],
  ['Purchase', 'cart', [['purchase', 'Purchase & Landed Cost', 'cart'], ['scan', 'Bill Scan', 'scan']]],
  ['Accounts', 'bank', [['bank', 'Bank Reconciliation', 'bank']]],
  ['HR', 'briefcase', [['hr', 'HR & Payroll', 'briefcase']]],
  ['Control', 'shield', [['reports', 'Reports', 'history'], ['security', 'Security Dashboard', 'shield'], ['audit', 'Audit Trail', 'history']]],
  ['Administration', 'settings', [['users', 'Users & Roles', 'user'], ['settings', 'Settings', 'settings']]],
];

const loadOpen = () => { try { return JSON.parse(localStorage.getItem('stc-nav-open')) || {}; } catch { return {}; } };

export const TITLES = Object.fromEntries([...TOP, ...NAV.flatMap(([, , items]) => items)].map(([k, t]) => [k, t]));

export function Layout({ page, children }) {
  const { user, db, logout } = useStore();
  const [open, setOpen] = useState(false);
  const go = (k) => { location.hash = '/' + k; setOpen(false); };
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const extra = { users: 'owner', settings: 'owner' };
  const [q, setQ] = useState('');
  const [sections, setSections] = useState(loadOpen);
  const can = (k) => (extra[k] ? user.role === extra[k] : canOpen(user.role, k));
  const match = (label) => label.toLowerCase().includes(q.trim().toLowerCase());
  const toggle = (group, isOpen) => setSections((s) => { const n = { ...s, [group]: !isOpen }; try { localStorage.setItem('stc-nav-open', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const link = (k, label, icon) => (
    <button key={k} className={`nav-link ${page === k ? 'active' : ''}`} onClick={() => go(k)}><Icon name={icon} style={{ color: NAV_COLORS[k] }} />{label}</button>
  );

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-logo">S</div>
            <div><div className="brand-name">{db.company.name}</div><div className="brand-sub">Enterprise Suite</div></div>
          </div>
        </div>
        <div className="nav-search"><Icon name="search" /><input placeholder="Search menu" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search menu" /></div>
        <nav className="nav">
          {TOP.filter(([k, label]) => can(k) && match(label)).map(([k, label, icon]) => link(k, label, icon))}
          {NAV.map(([group, gicon, items]) => {
            const visible = items.filter(([k, label]) => can(k) && (match(label) || match(group)));
            if (!visible.length) return null;
            const isOpen = !!q || (sections[group] ?? visible.some(([k]) => k === page));
            return (
              <div key={group} className="nav-section">
                <button className={`nav-folder ${visible.some(([k]) => k === page) ? 'has-active' : ''}`} onClick={() => toggle(group, isOpen)} aria-expanded={isOpen}>
                  <Icon name={gicon} style={{ color: SECTION_COLORS[group] }} />{group}<Icon name="chevronDown" className={`nav-chev ${isOpen ? 'open' : ''}`} />
                </button>
                <div className={`nav-children ${isOpen ? 'open' : ''}`}><div>{visible.map(([k, label, icon]) => link(k, label, icon))}</div></div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">Demo version · Designed &amp; developed by DTA · v0.5</div>
      </aside>
      {open && <div className="backdrop" style={{ zIndex: 25 }} onClick={() => setOpen(false)} />}
      <main className="main">
        <header className="topbar">
          <button className="btn ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
          <div className="crumb"><b>{TITLES[page]}</b></div>
          <div className="spacer" />
          <GlobalSearch />
          {canOpen(user.role, 'leads') && <QuickCreate />}
          <span className="demo-top" title="Each kind of new record is limited to 2 per login in this demo"><Icon name="lock" />Demo version · 2 new entries per feature per login</span>
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
