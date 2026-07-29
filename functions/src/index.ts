import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { createApp } from "./app";

if (!admin.apps.length) {
  admin.initializeApp();
}

const app = createApp();

/** Cloud Functions entry (optional path via Firebase emulator / deploy). */
export const api = functions.region("asia-southeast1").https.onRequest(app);
