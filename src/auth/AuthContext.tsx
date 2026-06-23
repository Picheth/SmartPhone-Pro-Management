import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  linkWithCredential,
  EmailAuthProvider,
  updatePassword
} from 'firebase/auth';

import { auth, db } from '../lib/firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logout = useCallback(() => signOut(auth), []);
  
  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    if (user && user.email?.toLowerCase() === 'pichethneou@gmail.com') {
      const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
      if (!hasPasswordProvider) {
        try {
          console.log("Linking email/password provider with Admin@123...");
          const credential = EmailAuthProvider.credential(user.email, 'Admin@123');
          await linkWithCredential(user, credential);
          console.log("Successfully linked email/password provider.");
        } catch (linkError) {
          console.error("Failed to link email/password provider:", linkError);
        }
      } else {
        try {
          console.log("Setting/Updating password to Admin@123...");
          await updatePassword(user, 'Admin@123');
          console.log("Successfully set/updated password.");
        } catch (passError) {
          console.error("Failed to update password:", passError);
        }
      }
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    // This is the line that performs the authentication
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      // Auto-create master admin if it doesn't exist yet
      if (
        email.toLowerCase() === 'pichethneou@gmail.com' &&
        password === 'Admin@123' &&
        error.code === 'auth/invalid-credential'
      ) {
        try {
          console.log("Master admin credentials matched. Auto-registering master admin...");
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;
          
          // Update profile
          await updateProfile(user, { displayName: 'picheth' });
          
          // Add to users collection
          await setDoc(doc(db, 'users', user.uid), {
            name: 'picheth',
            email,
            role: 'Admin',
            status: 'Offline',
            createdAt: serverTimestamp()
          });
          return; // Login succeeded via creation
        } catch (signUpError: any) {
          console.error("Auto-registration of master admin failed:", signUpError);
          if (signUpError.code === 'auth/email-already-in-use') {
            throw new Error("This master admin email is already registered via Google. Please sign in using 'Continue with Google' once to link/sync your password.");
          }
        }
      }
      console.error("Login failed:", error.message || error);
      throw error;
    } 
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, loginWithGoogle, loginWithEmail }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};