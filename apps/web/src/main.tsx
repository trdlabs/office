import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('#root not found');
// StrictMode intentionally omitted: its double-invoked effects double-mount the
// async PixiJS floor in dev. The kit cleans up either way, but the canvas can
// flicker — mirrors the example's main.tsx caveat. (Relevant from Milestone 3+.)
createRoot(host).render(<App />);
