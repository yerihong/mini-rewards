import * as admin from "firebase-admin";
import type { ActivityWebhookBody, ProcessedEventDoc, TransactionDoc } from "./types";

const db = () => admin.firestore();

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function assertActivityBody(body: unknown): ActivityWebhookBody {
  const b = body as Partial<ActivityWebhookBody> & { points?: unknown };
  if (!b || typeof b !== "object") {
    throw new HttpError(400, "INVALID_BODY", "Request body is required");
  }

  if (typeof b.eventId !== "string" || !b.eventId.trim()) {
    throw new HttpError(400, "INVALID_EVENT_ID", "eventId is required");
  }
  if (typeof b.userId !== "string" || !b.userId.trim()) {
    throw new HttpError(400, "INVALID_USER_ID", "userId is required");
  }
  if (typeof b.activityType !== "string" || !b.activityType.trim()) {
    throw new HttpError(400, "INVALID_ACTIVITY_TYPE", "activityType is required");
  }

  // Reject strings / booleans explicitly so partners get a clear 400 (not a silent coerce).
  if (typeof b.points === "string") {
    throw new HttpError(400, "INVALID_POINTS", "points must be a number, not a string");
  }
  if (typeof b.points !== "number" || !Number.isFinite(b.points)) {
    throw new HttpError(400, "INVALID_POINTS", "points must be a finite number");
  }
  if (b.points <= 0) {
    throw new HttpError(400, "INVALID_POINTS", "points must be greater than 0");
  }
  if (!Number.isInteger(b.points)) {
    throw new HttpError(400, "INVALID_POINTS", "points must be an integer (no decimals)");
  }

  return {
    eventId: b.eventId.trim(),
    userId: b.userId.trim(),
    activityType: b.activityType.trim(),
    points: b.points,
    partnerId: typeof b.partnerId === "string" ? b.partnerId.trim() : undefined,
  };
}

/** Credit points for a partner activity. Idempotent on eventId. */
export async function creditActivity(input: ActivityWebhookBody): Promise<{
  transactionId: string;
  balance: number;
  duplicate: boolean;
}> {
  const eventRef = db().collection("processedEvents").doc(input.eventId);
  const userRef = db().collection("users").doc(input.userId);
  const txRef = db().collection("transactions").doc();

  return db().runTransaction(async (txn) => {
    const existing = await txn.get(eventRef);
    if (existing.exists) {
      const data = existing.data() as ProcessedEventDoc;
      const userSnap = await txn.get(userRef);
      const balance = userSnap.exists ? (userSnap.data()?.balance as number) ?? 0 : 0;
      return {
        transactionId: data.transactionId,
        balance,
        duplicate: true,
      };
    }

    const userSnap = await txn.get(userRef);
    const currentBalance = userSnap.exists
      ? (userSnap.data()?.balance as number) ?? 0
      : 0;
    const nextBalance = currentBalance + input.points;

    const txDoc: TransactionDoc = {
      userId: input.userId,
      type: "earn",
      points: input.points,
      balanceAfter: nextBalance,
      eventId: input.eventId,
      status: "completed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        activityType: input.activityType,
        partnerId: input.partnerId,
      },
    };

    txn.set(
      userRef,
      {
        balance: nextBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    txn.set(txRef, txDoc);
    txn.set(eventRef, {
      transactionId: txRef.id,
      userId: input.userId,
      points: input.points,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      transactionId: txRef.id,
      balance: nextBalance,
      duplicate: false,
    };
  });
}

export async function getBalance(userId: string): Promise<number> {
  const snap = await db().collection("users").doc(userId).get();
  if (!snap.exists) return 0;
  return (snap.data()?.balance as number) ?? 0;
}

export async function listRewards(): Promise<
  Array<{ id: string; name: string; costPoints: number; active: boolean }>
> {
  const snap = await db().collection("rewards").where("active", "==", true).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name as string,
      costPoints: data.costPoints as number,
      active: data.active as boolean,
    };
  });
}

/** Redeem a reward with an atomic balance check + debit. */
export async function redeemReward(
  userId: string,
  rewardId: string
): Promise<{ transactionId: string; rewardId: string; balance: number }> {
  const userRef = db().collection("users").doc(userId);
  const rewardRef = db().collection("rewards").doc(rewardId);
  const txRef = db().collection("transactions").doc();

  return db().runTransaction(async (txn) => {
    const userSnap = await txn.get(userRef);
    const rewardSnap = await txn.get(rewardRef);

    if (!rewardSnap.exists) {
      throw new HttpError(404, "REWARD_NOT_FOUND", "Reward not found");
    }

    const reward = rewardSnap.data()!;
    if (!reward.active) {
      throw new HttpError(409, "REWARD_INACTIVE", "Reward is not available");
    }

    const cost = reward.costPoints as number;
    if (typeof cost !== "number" || cost <= 0) {
      throw new HttpError(500, "INVALID_REWARD", "Reward cost is misconfigured");
    }

    // Unknown users are not auto-created on redeem (unlike first earn webhook).
    if (!userSnap.exists) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    const currentBalance = (userSnap.data()?.balance as number) ?? 0;

    if (currentBalance < cost) {
      throw new HttpError(
        409,
        "INSUFFICIENT_BALANCE",
        `Need ${cost} points, have ${currentBalance}`
      );
    }

    const nextBalance = currentBalance - cost;
    if (nextBalance < 0) {
      // Defensive: should be unreachable after the check above.
      throw new HttpError(409, "INSUFFICIENT_BALANCE", "Balance would go negative");
    }

    const txDoc: TransactionDoc = {
      userId,
      type: "redeem",
      points: cost,
      balanceAfter: nextBalance,
      rewardId,
      status: "completed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    txn.set(
      userRef,
      {
        balance: nextBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    txn.set(txRef, txDoc);

    return {
      transactionId: txRef.id,
      rewardId,
      balance: nextBalance,
    };
  });
}

export async function listTransactions(
  userId: string,
  limit = 20
): Promise<
  Array<{
    id: string;
    type: string;
    points: number;
    balanceAfter: number;
    eventId?: string;
    rewardId?: string;
    status: string;
    createdAt: string | null;
    meta?: TransactionDoc["meta"];
  }>
> {
  const snap = await db()
    .collection("transactions")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 200))
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as TransactionDoc;
    const createdAt = data.createdAt as admin.firestore.Timestamp | undefined;
    return {
      id: doc.id,
      type: data.type,
      points: data.points,
      balanceAfter: data.balanceAfter,
      eventId: data.eventId,
      rewardId: data.rewardId,
      status: data.status,
      createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
      meta: data.meta,
    };
  });
}
