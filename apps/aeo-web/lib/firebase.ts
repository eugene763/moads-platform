"use client";

import {initializeApp, getApp, getApps} from "firebase/app";
import {GoogleAuthProvider, getAuth, signInWithPopup} from "firebase/auth";

function resolveFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("Firebase web config is missing. Set NEXT_PUBLIC_FIREBASE_* env vars.");
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
  };
}

function ensureFirebaseApp() {
  const firebaseConfig = resolveFirebaseConfig();
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export async function signInForAeoSession(): Promise<string> {
  const app = ensureFirebaseApp();
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return await credential.user.getIdToken(true);
}
