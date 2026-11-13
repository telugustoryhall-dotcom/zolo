import { applicationDefault, cert, initializeApp, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
      : '');
  let credential;
  if (serviceAccountJson) {
    try {
      credential = cert(JSON.parse(serviceAccountJson) as ServiceAccount);
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64 is invalid.', {
        cause: error,
      });
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
  }

  initializeApp({
    projectId: firebaseConfig.projectId,
    ...(credential ? { credential } : {}),
  });
}

export const adminAuth = getAuth();
