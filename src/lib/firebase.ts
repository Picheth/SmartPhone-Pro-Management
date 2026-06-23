import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBKYkrd7sW1V3DeS5VsRPYr7nmjn7ODCEM",
  authDomain: "inventory-management-2652c.firebaseapp.com",
  projectId: "inventory-management-2652c",
  storageBucket: "inventory-management-2652c.firebasestorage.app",
  messagingSenderId: "393233575693",
  appId: "1:393233575693:web:073cc83e4fa0d0c149ca44",
  measurementId: "G-5KF9E4SK5D"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };

  // Don't throw on permission-denied during sign-out — this is expected
  const isPermissionDenied = error instanceof Error && error.message.includes('permission-denied');
  const isSignedOut = !auth.currentUser;
  if (isPermissionDenied && isSignedOut) {
    console.warn('Firestore listener denied after sign-out (expected):', path);
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
