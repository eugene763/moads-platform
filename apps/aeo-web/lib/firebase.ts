"use client";

import {initializeApp, getApp, getApps} from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

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

function authFriendlyError(error: unknown): Error {
  if (error instanceof Error) {
    if (/auth\/unauthorized-domain/i.test(error.message)) {
      return new Error("Sign-in domain is not authorized yet. Add aeo.moads.agency to Firebase Authorized Domains.");
    }
    if (/auth\/popup-closed-by-user/i.test(error.message)) {
      return new Error("Sign-in popup was closed. Please try again.");
    }
    if (/auth\/invalid-credential|auth\/user-not-found|auth\/wrong-password/i.test(error.message)) {
      return new Error("Invalid email or password.");
    }
    if (/auth\/email-already-in-use/i.test(error.message)) {
      return new Error("This email is already registered. Use sign in instead.");
    }
    return error;
  }

  return new Error("Authentication failed.");
}

export async function signInForAeoSession(): Promise<string> {
  try {
    const app = ensureFirebaseApp();
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    return await credential.user.getIdToken(true);
  } catch (error) {
    throw authFriendlyError(error);
  }
}

export async function signInWithEmailForAeoSession(email: string, password: string): Promise<string> {
  try {
    const app = ensureFirebaseApp();
    const auth = getAuth(app);
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return await credential.user.getIdToken(true);
  } catch (error) {
    throw authFriendlyError(error);
  }
}

export async function signUpWithEmailForAeoSession(email: string, password: string): Promise<string> {
  try {
    const app = ensureFirebaseApp();
    const auth = getAuth(app);
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return await credential.user.getIdToken(true);
  } catch (error) {
    throw authFriendlyError(error);
  }
}

export async function sendAeoPasswordReset(email: string): Promise<void> {
  try {
    const app = ensureFirebaseApp();
    const auth = getAuth(app);
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    throw authFriendlyError(error);
  }
}

export async function getAeoSessionIdToken(): Promise<string> {
  const app = ensureFirebaseApp();
  const currentUser = getAuth(app).currentUser;
  if (!currentUser) {
    throw new Error("No active Firebase user session.");
  }

  return await currentUser.getIdToken(true);
}

export async function signOutFromAeoFirebase(): Promise<void> {
  const app = ensureFirebaseApp();
  const auth = getAuth(app);
  if (auth.currentUser) {
    await firebaseSignOut(auth);
  }
}
