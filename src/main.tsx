// Import React StrictMode for highlighting potential problems in development
import { StrictMode } from 'react'; // React strict mode wrapper
// Import React DOM client createRoot method
import { createRoot } from 'react-dom/client'; // client rendering entry point
// Import Leaflet core styles once globally
import "leaflet/dist/leaflet.css"; // Leaflet map tiles, controls, and pane styles
// Import Tailwind and theme CSS tokens
import './index.css'; // global styling and design tokens
// Import root application component
import App from './App.tsx'; // top-level application root

// Create root element and mount application inside StrictMode
createRoot(document.getElementById('root')!).render( // renders React tree
  <StrictMode> {/* development strict check */}
    <App /> {/* root application */}
  </StrictMode>, // closes StrictMode
); // closes createRoot render

