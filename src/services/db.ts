import { db } from '../lib/firebase';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  QueryConstraint,
  DocumentData,
  serverTimestamp
} from 'firebase/firestore';

export { db };

export const dbService = {
  // Subscribe to a collection's updates
  subscribe<T>(
    collectionName: string,
    callback: (data: T[]) => void,
    errorCallback?: (error: any) => void,
    constraints: QueryConstraint[] = []
  ) {
    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as unknown as T[];
        callback(items);
      },
      errorCallback
    );
  },

  // Get all documents from a collection
  async getAll<T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> {
    const q = query(collection(db, collectionName), ...constraints);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as unknown as T[];
  },

  // Get a single document from a collection
  async get<T>(collectionName: string, docId: string): Promise<T | null> {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as unknown as T;
    }
    return null;
  },

  // Add a new document to a collection
  async add<T extends DocumentData>(collectionName: string, data: T): Promise<string> {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  // Upsert/Set a document by ID
  async set<T extends DocumentData>(collectionName: string, docId: string, data: T): Promise<void> {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, data, { merge: true });
  },

  // Update a document by ID
  async update(collectionName: string, docId: string, data: Partial<DocumentData>): Promise<void> {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, data);
  },

  // Delete a document by ID
  async delete(collectionName: string, docId: string): Promise<void> {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  }
};
