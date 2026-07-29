import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export interface BalanceResponse {
  userId: string;
  balance: number;
}

export interface Reward {
  id: string;
  name: string;
  costPoints: number;
  active: boolean;
}

export interface TransactionItem {
  id: string;
  type: 'earn' | 'redeem' | string;
  points: number;
  balanceAfter: number;
  eventId?: string;
  rewardId?: string;
  status: string;
  createdAt: string | null;
  meta?: { activityType?: string; partnerId?: string };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly webhookSecret = environment.webhookSecret;

  constructor(private readonly http: HttpClient) {}

  getBalance(userId: string): Observable<BalanceResponse> {
    return this.http.get<BalanceResponse>(`${this.baseUrl}/users/${userId}/balance`);
  }

  getRewards(): Observable<{ items: Reward[] }> {
    return this.http.get<{ items: Reward[] }>(`${this.baseUrl}/rewards`);
  }

  getTransactions(userId: string, limit = 200): Observable<{ items: TransactionItem[] }> {
    return this.http.get<{ items: TransactionItem[] }>(
      `${this.baseUrl}/users/${userId}/transactions?limit=${limit}`
    );
  }

  redeem(userId: string, rewardId: string): Observable<{ ok: boolean; balance: number }> {
    return this.http.post<{ ok: boolean; balance: number }>(
      `${this.baseUrl}/users/${userId}/redeem`,
      { rewardId }
    );
  }

  simulateActivity(
    userId: string,
    points: number,
    eventId?: string
  ): Observable<{
    ok: boolean;
    balance: number;
    duplicate: boolean;
    transactionId: string;
    eventId: string;
  }> {
    const headers = new HttpHeaders({
      'X-Webhook-Secret': this.webhookSecret,
    });
    const resolvedEventId =
      eventId?.trim() ||
      `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return this.http.post<{
      ok: boolean;
      balance: number;
      duplicate: boolean;
      transactionId: string;
    }>(
      `${this.baseUrl}/webhook/activity`,
      {
        eventId: resolvedEventId,
        userId,
        activityType: 'purchase',
        points,
        partnerId: 'partner_demo',
      },
      { headers }
    ).pipe(
      // expose the eventId used so the UI can offer “resend last”
      map((res) => ({ ...res, eventId: resolvedEventId }))
    );
  }
}
