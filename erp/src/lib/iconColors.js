// Colours for icons, so every area is recognisable at a glance (Zoho-style).
// Sidebar colours are brighter because they sit on the dark navy menu.
export const NAV_COLORS = {
  dashboard: '#6fa8ff', crmhome: '#a5acff', analytics: '#c58bff', me: '#4fd1c5',
  leads: '#ff7aa8', contacts: '#4fd6b5', accounts: '#ffb05c', deals: '#6fb1ff', forecasts: '#6fe08f', campaigns: '#ff8a80',
  tasks: '#7be495', meetings: '#b39dff', calls: '#5cc8ff',
  pos: '#ffd166', sales: '#8ecbff', customers: '#ff9fb2', collections: '#ffa86b', pricelists: '#7fe0c9', crm: '#ffc857',
  products: '#ffb870', inventory: '#6fd0ff', warehouse: '#c3a6ff', purchase: '#ff9d6c', scan: '#7fdcff', bank: '#79e0a6', hr: '#ff8fb8',
  accgate: '#ffd166', accv: '#ff8a80', accdb: '#8ecbff', accl: '#b39dff', acctb: '#7fe0c9', accpl: '#6fe08f', accbs: '#ffb870', accm: '#aab8d6',
  reports: '#9ab6ff', security: '#ff9a8a', audit: '#d0b0ff', users: '#6fd6ff', settings: '#aab8d6',
};
export const SECTION_COLORS = {
  'CRM Sales': '#ff7aa8', Activities: '#7be495', 'Billing & Sales': '#ffd166', Inventory: '#6fd0ff', Purchase: '#ff9d6c',
  Accounting: '#79e0a6', HR: '#ff8fb8', Control: '#9ab6ff', Administration: '#aab8d6',
};
// For light surfaces.
export const MODULE_COLORS = {
  leads: '#d9467a', contacts: '#14907f', accounts: '#c7791a', deals: '#2a78d6',
  tasks: '#2e9a52', meetings: '#6250d6', calls: '#1f8fd1', campaigns: '#e0483f',
};
export const ICON_TINT = {
  upload: '#2a78d6', download: '#2e9a52', edit: '#c7791a', user: '#6250d6', users: '#2a78d6', columns: '#1f8fd1', trash: '#e0483f',
  copy: '#6250d6', check: '#2e9a52', phone: '#1f8fd1', whatsapp: '#25a244', mail: '#d9467a', convert: '#c7791a', kanban: '#6250d6',
  plus: '#2a78d6', refresh: '#1f8fd1', note: '#c7791a', lock: '#c7791a', chevronLeft: '#6b7a99', chevronRight: '#6b7a99',
};
export const VIEW_COLORS = { table: '#2a78d6', kanban: '#6250d6', cards: '#14907f', calendar: '#e8731a', chart: '#d9467a' };
export const GROUP_COLORS = { CRM: '#2a78d6', Sales: '#2e9a52', Credit: '#e0483f', Inventory: '#c7791a', Purchase: '#6250d6' };
export const GROUP_ICON = { CRM: 'target', Sales: 'chart', Credit: 'wallet', Inventory: 'box', Purchase: 'cart' };
// Soft tinted badge: coloured icon on a pale wash of the same colour.
export const tint = (c) => ({ color: c, background: `${c}1f` });
