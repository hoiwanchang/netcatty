import { init as initGhostty } from 'ghostty-web';
import ReactDOM from 'react-dom/client';
import App from './App';

// Pre-load Ghostty WASM immediately on app start for faster terminal open
initGhostty().catch((err) => {
  console.warn('[Ghostty] WASM preload failed, will retry on terminal open:', err);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode causes double renders in development - disabled for performance testing
  // <React.StrictMode>
  <App />
  // </React.StrictMode>
);