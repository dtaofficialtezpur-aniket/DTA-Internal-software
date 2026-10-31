import { useEffect, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { canOpen } from './lib/calc.js';
import { Layout } from './components/Layout.jsx';
import { DemoLimitModal, Toasts } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pos from './pages/Pos.jsx';
import Sales from './pages/Sales.jsx';
import Customers from './pages/Customers.jsx';
import Collections from './pages/Collections.jsx';
import Pricelists from './pages/Pricelists.jsx';
import Products from './pages/Products.jsx';
import Inventory from './pages/Inventory.jsx';
import Warehouse from './pages/Warehouse.jsx';
import Purchase from './pages/Purchase.jsx';
import Reports from './pages/Reports.jsx';
import Security from './pages/Security.jsx';
import Audit from './pages/Audit.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Portal from './pages/Portal.jsx';
import Hr from './pages/Hr.jsx';
import Crm from './pages/Crm.jsx';
import Bank from './pages/Bank.jsx';
import BillScan from './pages/BillScan.jsx';

const PAGES = { dashboard: Dashboard, pos: Pos, sales: Sales, customers: Customers, collections: Collections, pricelists: Pricelists,
  products: Products, inventory: Inventory, warehouse: Warehouse, purchase: Purchase, reports: Reports, security: Security,
  audit: Audit, users: Users, settings: Settings, me: Portal, hr: Hr, crm: Crm, bank: Bank, scan: BillScan };
const OWNER_ONLY = ['users', 'settings'];
const HOME = { owner: 'dashboard', sales_manager: 'dashboard', accounts: 'dashboard', cashier: 'pos', salesman: 'pos', warehouse: 'warehouse', delivery: 'warehouse', security: 'security' };

const readHash = () => location.hash.replace(/^#\/?/, '').split('?')[0];

export default function App() {
  const { db, user } = useStore();
  const [hash, setHash] = useState(readHash);
  useEffect(() => {
    const h = () => setHash(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  if (!db) return <div className="splash"><div className="spinner" /></div>;
  if (!user) return <><Login /><Toasts /></>;

  const allowed = (p) => PAGES[p] && (OWNER_ONLY.includes(p) ? user.role === 'owner' : canOpen(user.role, p));
  const page = allowed(hash) ? hash : HOME[user.role];
  const Page = PAGES[page];
  return (
    <>
      <Layout page={page}><Page /></Layout>
      <DemoLimitModal />
      <Toasts />
    </>
  );
}
