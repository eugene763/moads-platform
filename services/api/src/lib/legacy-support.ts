import type {Firestore} from "firebase-admin/firestore";

import {normalizeSupportCode} from "@moads/db";

export async function readLegacySupportCode(
  firestore: Firestore,
  firebaseUid: string,
): Promise<string | null> {
  try {
    const userDoc = await firestore.collection("users").doc(firebaseUid).get();
    const supportCodeRaw = userDoc.data()?.supportCode;
    if (typeof supportCodeRaw !== "string") {
      return null;
    }

    return normalizeSupportCode(supportCodeRaw);
  } catch {
    return null;
  }
}
