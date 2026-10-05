import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  // apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  // projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  // messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  // appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  apiKey: "AIzaSyB8WJFq02o-TrmnJLTiN7Wssvqk-PIRw88",
  authDomain: "unravel-subharthy.firebaseapp.com",
  projectId: "unravel-subharthy",
  storageBucket: "unravel-subharthy.firebasestorage.app",
  messagingSenderId: "563857333556",
  appId: "1:563857333556:web:cb53c36e5d862514cf5961",
  measurementId: "G-EVCB8B8H0X"
 
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export async function getAuthToken() {
  const user = auth.currentUser;

  if (!user) {
    return null;
  }

  return await user.getIdToken();
}