import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import {
  HttpError,
  assertActivityBody,
  creditActivity,
  getBalance,
  listRewards,
  listTransactions,
  redeemReward,
} from "./rewards";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "demo-secret";

export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());

  function requireWebhookSecret(req: Request, _res: Response, next: NextFunction) {
    const secret = req.header("X-Webhook-Secret");
    if (secret !== WEBHOOK_SECRET) {
      next(new HttpError(401, "UNAUTHORIZED", "Invalid webhook secret"));
      return;
    }
    next();
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "mini-rewards" });
  });

  /** Partner activity webhook → credit points. Idempotent on eventId. */
  app.post("/webhook/activity", requireWebhookSecret, async (req, res, next) => {
    try {
      const body = assertActivityBody(req.body);
      const result = await creditActivity(body);
      res.status(result.duplicate ? 200 : 201).json({
        ok: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/users/:userId/balance", async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const balance = await getBalance(userId);
      res.json({ userId, balance });
    } catch (err) {
      next(err);
    }
  });

  app.get("/users/:userId/transactions", async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const limit = Number(req.query.limit ?? 20);
      const items = await listTransactions(userId, Number.isFinite(limit) ? limit : 20);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  app.post("/users/:userId/redeem", async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const rewardId = req.body?.rewardId;
      if (!rewardId || typeof rewardId !== "string") {
        throw new HttpError(400, "INVALID_REWARD_ID", "rewardId is required");
      }
      const result = await redeemReward(userId, rewardId.trim());
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  app.get("/rewards", async (_req, res, next) => {
    try {
      const items = await listRewards();
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ ok: false, error: "INTERNAL", message: "Unexpected error" });
  });

  return app;
}
