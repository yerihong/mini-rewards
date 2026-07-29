/**
 * Seed demo rewards into the Firestore emulator (or a real project).
 *
 * Usage (with emulator running):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node lib/seed.js
 */
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "heymax-mini-rewards" });
}

const db = admin.firestore();

const rewards = [
  {
    id: "reward_coffee",
    name: "Coffee Voucher",
    costPoints: 50,
    active: true,
  },
  {
    id: "reward_movie",
    name: "Movie Ticket",
    costPoints: 120,
    active: true,
  },
  {
    id: "reward_hotel",
    name: "Hotel Night Credit",
    costPoints: 500,
    active: true,
  },
];

async function main() {
  for (const reward of rewards) {
    const { id, ...data } = reward;
    await db.collection("rewards").doc(id).set(data, { merge: true });
    console.log(`Seeded reward: ${id}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
