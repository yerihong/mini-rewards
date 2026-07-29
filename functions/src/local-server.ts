/**
 * Local API server against the Firestore emulator.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=heymax-mini-rewards node lib/local-server.js
 */
import * as admin from "firebase-admin";
import { createApp } from "./app";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "heymax-mini-rewards" });
}

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`Mini Rewards API listening on http://127.0.0.1:${port}`);
  console.log(`Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST || "(not set)"}`);
});
