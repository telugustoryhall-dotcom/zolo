import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export async function getFcmMessaging(): Promise<ReturnType<typeof getMessaging> | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !(await isSupported())) {
    return null;
  }
  return getMessaging(app);
}

export async function getFcmRegistrationToken(requestPermission: boolean): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    throw new Error('This browser does not support web notifications.');
  }
  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support notification service workers.');
  }
  const messaging = await getFcmMessaging();
  if (!messaging) throw new Error('Firebase Cloud Messaging is not supported in this browser.');

  let permission = Notification.permission;
  if (permission === 'default' && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission === 'denied') throw new Error('Notification permission is blocked in browser settings.');
  if (permission !== 'granted') return null;

  const response = await fetch('/api/config', { credentials: 'include' });
  if (!response.ok) throw new Error('Could not load Firebase messaging configuration.');
  const config = await response.json() as { firebaseMessaging?: { vapidPublicKey?: string } };
  const vapidKey = config.firebaseMessaging?.vapidPublicKey;
  if (!vapidKey) throw new Error('Web Push is not configured on this ZOLO server.');

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}

export async function subscribeToFcmMessages(
  callback: (payload: MessagePayload) => void
): Promise<(() => void) | null> {
  const messaging = await getFcmMessaging();
  return messaging ? onMessage(messaging, callback) : null;
}
