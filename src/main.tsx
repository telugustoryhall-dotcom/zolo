import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initializeFirebaseAnalytics } from './lib/firebase-analytics';
import './index.css';

void initializeFirebaseAnalytics().catch((error: unknown) => {
  console.error('Firebase Analytics initialization failed:', error);
});

createRoot(document.getElementById('root')!).render(<App />);
