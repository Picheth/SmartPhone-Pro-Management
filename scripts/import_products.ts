import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBKYkrd7sW1V3DeS5VsRPYr7nmjn7ODCEM",
  authDomain: "inventory-management-2652c.firebaseapp.com",
  projectId: "inventory-management-2652c",
  storageBucket: "inventory-management-2652c.firebasestorage.app",
  messagingSenderId: "393233575693",
  appId: "1:393233575693:web:073cc83e4fa0d0c149ca44",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const productsData = [
  {
    name: "iPhone 7 Plus LA 32GB SC",
    variations: [
      { sku: "000001-1", color: "Black", storage: "32GB", condition: "SC", countryCode: "LA" },
      { sku: "000001-2", color: "Silver", storage: "32GB", condition: "SC", countryCode: "LA" },
      { sku: "000001-3", color: "Gold", storage: "32GB", condition: "SC", countryCode: "LA" },
      { sku: "000001-4", color: "Rose Gold", storage: "32GB", condition: "SC", countryCode: "LA" },
      { sku: "000001-5", color: "Red", storage: "32GB", condition: "SC", countryCode: "LA" },
    ]
  },
  {
    name: "iPhone 7 Plus LA 128GB SC",
    variations: [
      { sku: "000002-1", color: "Black", storage: "128GB", condition: "SC", countryCode: "LA" },
    ]
  }
];

async function seed() {
  console.log("Starting seed...");
  try {
    for (const p of productsData) {
      const vars = p.variations.map(v => ({
        id: Math.random().toString(36).substr(2, 9),
        ...v
      }));
      
      const docRef = await addDoc(collection(db, 'products'), {
        name: p.name,
        variations: vars,
        createdAt: serverTimestamp()
      });
      console.log(`Added product: ${p.name} with ID ${docRef.id}`);
    }
    console.log("Seed completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
