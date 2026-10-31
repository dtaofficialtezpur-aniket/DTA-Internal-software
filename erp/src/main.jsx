import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-serif/500.css';
import '@fontsource/ibm-plex-serif/600.css';
import './styles.css';
import { StoreProvider } from './lib/store.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<StoreProvider><App /></StoreProvider>);
