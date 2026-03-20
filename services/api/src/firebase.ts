import {type AppOptions, applicationDefault, cert, getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getStorage} from "firebase-admin/storage";

import {ApiConfig, FirebaseContext} from "./types.js";

export function getFirebaseContext(config: ApiConfig): FirebaseContext {
  const existing = getApps()[0];
  if (config.firebaseAuthEmulatorHost) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = config.firebaseAuthEmulatorHost;
  } else {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }

  if (config.firebaseStorageEmulatorHost) {
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = config.firebaseStorageEmulatorHost;
  } else {
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  }

  if (config.firebaseProjectId) {
    process.env.GCLOUD_PROJECT = config.firebaseProjectId;
  }

  const appOptions: AppOptions = {
    ...(config.firebaseProjectId ? {projectId: config.firebaseProjectId} : {}),
    ...(config.firebaseStorageBucket ? {storageBucket: config.firebaseStorageBucket} : {}),
  };

  if (!config.firebaseUseEmulators) {
    appOptions.credential = config.firebaseServiceAccountJson ?
      cert(JSON.parse(config.firebaseServiceAccountJson)) :
      applicationDefault();
  }

  const app = existing ?? initializeApp(appOptions);

  const storage = getStorage(app);
  const bucket = config.firebaseStorageBucket ?
    storage.bucket(config.firebaseStorageBucket) :
    storage.bucket();

  return {
    auth: getAuth(app),
    bucket,
    bucketName: bucket.name,
  };
}
