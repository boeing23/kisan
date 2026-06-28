/**
 * Copy to config.js and fill in. config.js is gitignored.
 * The Firebase web apiKey is safe to expose (locked by Firestore rules);
 * restrict the Maps key by HTTP referrer in the Cloud console before deploy.
 */
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "kisan-alert-500812.firebaseapp.com",
  projectId: "kisan-alert-500812",
  storageBucket: "kisan-alert-500812.firebasestorage.app",
  messagingSenderId: "815941216751",
  appId: "YOUR_APP_ID",
};

export const FIRESTORE_DB_ID = "kisan-db";
export const MAPS_API_KEY = "YOUR_MAPS_API_KEY";
