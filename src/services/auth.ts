import { auth } from "../lib";
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as firebaseUpdateProfile,
  deleteUser as firebaseDeleteUser,
  updateEmail,
  User as FirebaseUser,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

// 1. Centralize the Master Email
const MASTER_ADMIN_EMAIL = 'pichethneou@gmail.com';

export type UserRole = 'superadmin' | 'admin' | 'user' | string;

export interface User {
  id?: string;
  email: string;
  username: string;
  role: UserRole;
  isFallback?: boolean;
}

// --- ROLE-BASED PERMISSION HELPERS ---

const ADMIN_ROLES = ['SuperAdmin', 'Admin', 'Editor', 'Viewer', 'User'];

function hasAdminRole(user: User | null): boolean {
  if (!user) return false;
  return ADMIN_ROLES.includes(user.role);
}

// --- PERMISSIONS ---
export const canManageUsers = (user: any) => {
  if (!user) return false;
  if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  return hasAdminRole(user);
};

export function canEditData(user: User | null): boolean {
  if (!user) return false;
  if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  return hasAdminRole(user);
}

export function canViewData(user: User | null): boolean {
  if (!user) return false;
  if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  // All authenticated users can view data
  return true;
}

export const isSuperAdmin = (user: User | null) => {
  return user && (user.role === 'superadmin' || user.role === 'SuperAdmin' || user.email?.toLowerCase() === MASTER_ADMIN_EMAIL);
};

export const isAdmin = (user: User | null) => {
  if (!user) return false;
  if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  return hasAdminRole(user);
};

export const isBasicUser = (user: User | null) => {
  if (!user) return false;
  if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return false;
  return !hasAdminRole(user);
};

// --- AUTHENTICATION (Firebase) ---

export async function signup(email: string, password: string, role: UserRole = 'user', username: string): Promise<string | null> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update display name
    await firebaseUpdateProfile(userCredential.user, { displayName: username });
    
    // Store user profile in Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      email,
      username,
      role,
      createdAt: new Date()
    });

    return null;
  } catch (error: any) {
    return error.message;
  }
}

export async function signin(email: string, password: string): Promise<string | null> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return null;
  } catch (error: any) {
    console.error("Login failed:", error.message);
    return error.message;
  }
}

export async function signout(): Promise<void> {
  await signOut(auth);
}

// --- USER MAPPING ---

export function mapFirebaseUser(fbUser: FirebaseUser | null): User | null {
  if (!fbUser) return null;
  const email = fbUser.email || '';
  const role = email.toLowerCase() === MASTER_ADMIN_EMAIL ? 'superadmin' : 'user';
  return {
    id: fbUser.uid,
    email,
    username: fbUser.displayName || email.split('@')[0],
    role: role as UserRole,
  };
}

export async function getCurrentUser(): Promise<User | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  try {
    // Try to get profile from Firestore
    const profileDoc = await getDoc(doc(db, 'users', currentUser.uid));
    
    if (profileDoc.exists()) {
      const profile = profileDoc.data();
      const email = profile.email || currentUser.email || '';
      const role = email.toLowerCase() === MASTER_ADMIN_EMAIL ? 'superadmin' : (profile.role || 'user');
      
      return {
        id: currentUser.uid,
        email,
        username: profile.username || currentUser.displayName || '',
        role: role as UserRole,
        isFallback: false,
      };
    }

    // Fallback to Firebase Auth user data
    const fallback = mapFirebaseUser(currentUser);
    return fallback ? { ...fallback, isFallback: true } : null;
  } catch (error) {
    // If Firestore fails, use Firebase Auth data
    const fallback = mapFirebaseUser(currentUser);
    return fallback ? { ...fallback, isFallback: true } : null;
  }
}

// --- ADMIN OPERATIONS ---

export async function updateProfile(updates: { username?: string; email?: string }): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return "No authenticated user";

  try {
    if (updates.username) {
      await firebaseUpdateProfile(currentUser, { displayName: updates.username });
    }
    if (updates.email) {
      await updateEmail(currentUser, updates.email);
    }
    
    // Update Firestore profile
    await updateDoc(doc(db, 'users', currentUser.uid), {
      ...(updates.username && { username: updates.username }),
      ...(updates.email && { email: updates.email }),
    });

    return null;
  } catch (error: any) {
    return error.message;
  }
}

export async function updateUserRole(userId: string, newRole: UserRole): Promise<string | null> {
  try {
    await updateDoc(doc(db, 'users', userId), { role: newRole });
    return null;
  } catch (error: any) {
    return error.message;
  }
}

export async function deleteUser(userId: string): Promise<string | null> {
  try {
    // Delete user profile from Firestore
    await deleteDoc(doc(db, 'users', userId));
    // Note: Deleting the Firebase Auth user requires Admin SDK (server-side)
    // This only removes the Firestore profile
    return null;
  } catch (error: any) {
    return error.message;
  }
}

export async function adminCreateUser(email: string, password: string, username: string, role: UserRole): Promise<{ error: string | null; userId?: string }> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;

    await firebaseUpdateProfile(userCredential.user, { displayName: username });

    await setDoc(doc(db, 'users', userId), {
      email,
      username,
      role,
      createdAt: new Date()
    });

    return { error: null, userId };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function resetUserPassword(userId: string, newPassword?: string): Promise<string | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return "User profile not found in Firestore.";
    }
    const email = userDoc.data().email;
    if (!email) {
      return "User email address not found.";
    }
    await sendPasswordResetEmail(auth, email);
    return null;
  } catch (error: any) {
    return error.message;
  }
}
