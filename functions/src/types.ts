export type TxType = "earn" | "redeem";

export interface ActivityWebhookBody {
  eventId: string;
  userId: string;
  activityType: string;
  points: number;
  partnerId?: string;
}

export interface TransactionDoc {
  userId: string;
  type: TxType;
  points: number;
  balanceAfter: number;
  eventId?: string;
  rewardId?: string;
  status: "completed" | "failed";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
  meta?: {
    activityType?: string;
    partnerId?: string;
  };
}

export interface ProcessedEventDoc {
  transactionId: string;
  userId: string;
  points: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processedAt: any;
}
