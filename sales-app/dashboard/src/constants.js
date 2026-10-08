// The one backend this whole sales team uses. Change this (and the CSP connect-src in index.html)
// to point at your own server. Not a secret -- the login system protects the data.
export const BACKEND_URL = 'https://dtaonline.in/DTA_Sales/api.php';

export const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
  'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];
export const PRODUCTS = { software: 'Software', app: 'Application', website: 'Website' };
export const STAGES = { new: 'New', contacted: 'Contacted', demo: 'Demo', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
export const ACTIVITY_TYPES = { call: 'Call', visit: 'Visit', meeting: 'Meeting', follow_up: 'Follow-up', note: 'Note' };
export const ACTIVITY_LABELS = { ...ACTIVITY_TYPES, lead_added: 'Lead added', stage_change: 'Stage change', client_won: 'Client won', demo_requested: 'Demo requested', demo_update: 'Demo update' };
export const DEMO_STATUS = { pending: 'Pending', scheduled: 'Scheduled', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
export const DEMO_MODES = { online: 'Online (video call)', onsite: 'On-site visit' };
