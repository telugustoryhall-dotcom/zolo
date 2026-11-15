import { getAnalytics, isSupported } from 'firebase/analytics';
import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';

const analyticsAppName = 'zolo-analytics';
const analyticsConfig: FirebaseOptions = {
  apiKey: 'AIzaSyBKrAxPKIRcPqpVUe4oN_R1_zmLn1yMTpQ',
  authDomain: 'viplav-kampelly.firebaseapp.com',
  projectId: 'viplav-kampelly',
  storageBucket: 'viplav-kampelly.firebasestorage.app',
  messagingSenderId: '1052814014309',
  appId: '1:1052814014309:web:ca2ecb5fe44c58ce2a538c',
  measurementId: 'G-G7SJJ4YJMK',
};

export async function initializeFirebaseAnalytics() {
  if (typeof window === 'undefined' || !(await isSupported())) {
    return null;
  }

  const app =
    getApps().find((firebaseApp) => firebaseApp.name === analyticsAppName) ??
    initializeApp(analyticsConfig, analyticsAppName);
  return getAnalytics(app);
}
