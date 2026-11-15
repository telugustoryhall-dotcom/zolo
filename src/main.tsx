import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initializeFirebaseAnalytics } from './lib/firebase-analytics';
import './index.css';

// Reuse the root-scoped Firebase worker for PWA fetch handling and push notifications.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((error: unknown) => {
    console.error('PWA service worker registration failed:', error);
  });
}

void initializeFirebaseAnalytics().catch((error: unknown) => {
  console.error('Firebase Analytics initialization failed:', error);
});

createRoot(document.getElementById('root')!).render(<App />);
