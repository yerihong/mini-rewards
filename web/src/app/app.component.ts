import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Reward, TransactionItem } from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'Mini Rewards';
  userId = 'user_1';
  balance: number | null = null;
  rewards: Reward[] = [];

  // Raw API result
  allTransactions: TransactionItem[] = [];
  // UI display list (filtered + sorted)
  displayTransactions: TransactionItem[] = [];

  earnPoints = 100;
  /** Optional: leave blank to auto-generate. Reuse to test idempotency. */
  eventIdInput = '';
  lastEventId = '';
  lastEarnPoints = 100;

  /** Matches API fetch size — if we get fewer rows, ledger sum is complete. */
  readonly txFetchLimit = 200;

  loading = false;
  /** Which write action is in flight — used for button labels + double-click guard */
  busyAction: 'idle' | 'earn' | 'redeem' | 'refresh' = 'idle';
  message = '';
  error = '';

  // Toast UX
  toastVisible = false;
  toastMessage = '';
  toastKind: 'ok' | 'err' | 'warn' = 'ok';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Confirm popup
  confirmOpen = false;
  confirmTitle = '';
  confirmBody = '';
  confirmCta = 'Confirm';
  private pendingConfirm: (() => void) | null = null;

  // History UX
  historyQuery = '';
  historySort: 'newest' | 'oldest' = 'newest';

  // Pagination
  pageSize = 5;
  pageSizeOptions = [5, 20, 100];
  currentPage = 0;
  pagedTransactions: TransactionItem[] = [];

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.busyAction === 'earn' || this.busyAction === 'redeem') {
      this.showToast('Please wait — a request is already in progress', 'err');
      return;
    }

    this.loading = true;
    this.busyAction = 'refresh';
    this.error = '';

    this.api.getBalance(this.userId).subscribe({
      next: (res) => {
        this.balance = res.balance;
      },
      error: (err) => this.handleError(err),
    });

    this.api.getRewards().subscribe({
      next: (res) => {
        this.rewards = res.items;
      },
      error: (err) => this.handleError(err),
    });

    this.api.getTransactions(this.userId, this.txFetchLimit).subscribe({
      next: (res) => {
        this.allTransactions = res.items;
        this.applyHistoryView();
        this.finishLoading();
      },
      error: (err) => {
        this.finishLoading();
        this.handleError(err);
      },
    });
  }

  simulateEarn(): void {
    if (this.loading) {
      this.showToast('Please wait — a request is already in progress', 'err');
      return;
    }
    if (!this.isEarnValid) {
      this.showToast('Points must be a positive integer', 'err');
      return;
    }

    const eventId = this.eventIdInput.trim();
    this.openConfirm({
      title: 'Send webhook?',
      body: eventId
        ? `Credit ${this.earnPoints} points to ${this.userId} with eventId “${eventId}”? If this ID was already processed, no points will be added.`
        : `Credit ${this.earnPoints} points to ${this.userId} from a partner activity event?`,
      cta: 'Send webhook',
      onConfirm: () => this.executeEarn(eventId || undefined),
    });
  }

  resendLastEvent(): void {
    if (this.loading) {
      this.showToast('Please wait — a request is already in progress', 'err');
      return;
    }
    if (!this.lastEventId) {
      this.showToast('No previous event ID to resend yet', 'err');
      return;
    }

    this.openConfirm({
      title: 'Resend last event ID?',
      body: `Replay eventId “${this.lastEventId}” with ${this.lastEarnPoints} points. Expected: Event already processed — no points added.`,
      cta: 'Resend',
      onConfirm: () => this.executeEarn(this.lastEventId, this.lastEarnPoints),
    });
  }

  get isEarnValid(): boolean {
    return Number.isInteger(this.earnPoints) && this.earnPoints > 0;
  }

  onEarnPointsChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      this.earnPoints = 1;
      return;
    }
    this.earnPoints = Math.max(1, Math.floor(n));
  }

  redeem(reward: Reward): void {
    if (this.loading || this.isRedeemDisabled(reward)) {
      if (this.loading) {
        this.showToast('Please wait — a request is already in progress', 'err');
      }
      return;
    }

    this.openConfirm({
      title: 'Redeem reward?',
      body: `Spend ${reward.costPoints} points on “${reward.name}”? Current balance: ${this.balance} pts.`,
      cta: 'Redeem',
      onConfirm: () => this.executeRedeem(reward),
    });
  }

  cancelConfirm(): void {
    this.confirmOpen = false;
    this.pendingConfirm = null;
  }

  acceptConfirm(): void {
    const run = this.pendingConfirm;
    this.confirmOpen = false;
    this.pendingConfirm = null;
    run?.();
  }

  private openConfirm(opts: {
    title: string;
    body: string;
    cta: string;
    onConfirm: () => void;
  }): void {
    this.confirmTitle = opts.title;
    this.confirmBody = opts.body;
    this.confirmCta = opts.cta;
    this.pendingConfirm = opts.onConfirm;
    this.confirmOpen = true;
  }

  private executeEarn(eventId?: string, points = this.earnPoints): void {
    if (this.loading) {
      this.showToast('Please wait — a request is already in progress', 'err');
      return;
    }

    this.loading = true;
    this.busyAction = 'earn';
    this.message = '';
    this.error = '';
    this.api.simulateActivity(this.userId, points, eventId).subscribe({
      next: (res) => {
        this.balance = res.balance;
        this.lastEventId = res.eventId;
        this.lastEarnPoints = points;
        this.message = res.duplicate
          ? 'Event already processed. No points were added.'
          : `${points} points credited`;
        this.showToast(this.message, res.duplicate ? 'warn' : 'ok');
        this.refreshAfterWrite();
      },
      error: (err) => {
        this.finishLoading();
        this.handleError(err);
      },
    });
  }

  private executeRedeem(reward: Reward): void {
    if (this.loading) {
      this.showToast('Please wait — a request is already in progress', 'err');
      return;
    }

    this.loading = true;
    this.busyAction = 'redeem';
    this.message = '';
    this.error = '';
    this.api.redeem(this.userId, reward.id).subscribe({
      next: (res) => {
        this.balance = res.balance;
        this.message = `${reward.name} redeemed`;
        this.showToast(this.message, 'ok');
        this.refreshAfterWrite();
      },
      error: (err) => {
        this.finishLoading();
        this.handleError(err);
      },
    });
  }

  /** After earn/redeem succeeds, reload lists without treating it as a user-triggered refresh. */
  private refreshAfterWrite(): void {
    this.busyAction = 'refresh';
    this.error = '';

    this.api.getBalance(this.userId).subscribe({
      next: (res) => {
        this.balance = res.balance;
      },
      error: (err) => this.handleError(err),
    });

    this.api.getRewards().subscribe({
      next: (res) => {
        this.rewards = res.items;
      },
      error: (err) => this.handleError(err),
    });

    this.api.getTransactions(this.userId, this.txFetchLimit).subscribe({
      next: (res) => {
        this.allTransactions = res.items;
        this.applyHistoryView();
        this.finishLoading();
      },
      error: (err) => {
        this.finishLoading();
        this.handleError(err);
      },
    });
  }

  private finishLoading(): void {
    this.loading = false;
    this.busyAction = 'idle';
  }

  toggleHistorySort(): void {
    this.historySort = this.historySort === 'newest' ? 'oldest' : 'newest';
    this.applyHistoryView();
  }

  /** Sum of loaded txs. Only a full check when count < fetch limit. */
  get recentLedgerTotal(): number {
    return (this.allTransactions ?? []).reduce((acc, tx) => {
      if (tx.type === 'earn') return acc + tx.points;
      if (tx.type === 'redeem') return acc - tx.points;
      return acc;
    }, 0);
  }

  /** True when we almost certainly have every tx (response smaller than limit). */
  get ledgerIsComplete(): boolean {
    return this.allTransactions.length < this.txFetchLimit;
  }

  get balanceMismatch(): boolean {
    return (
      this.ledgerIsComplete &&
      this.balance !== null &&
      this.balance !== this.recentLedgerTotal
    );
  }

  isRedeemDisabled(reward: Reward): boolean {
    if (this.loading) return true;
    if (this.balance === null) return true;
    return reward.costPoints > this.balance;
  }

  redeemDisabledTitle(reward: Reward): string {
    if (this.loading) return 'Processing...';
    if (this.balance === null) return 'Balance is loading...';
    if (reward.costPoints > this.balance) {
      const need = reward.costPoints - this.balance;
      return `Need ${need} more points`;
    }
    return 'Redeem';
  }

  applyHistoryView(): void {
    const q = this.historyQuery.trim().toLowerCase();
    const base = this.allTransactions ?? [];

    const filtered =
      q.length === 0
        ? base
        : base.filter((tx) => {
            const haystack = [
              tx.id,
              tx.type,
              tx.eventId ?? '',
              tx.rewardId ?? '',
              tx.status,
              tx.meta?.activityType ?? '',
            ]
              .join(' ')
              .toLowerCase();
            return haystack.includes(q);
          });

    const sorted = [...filtered].sort((a, b) => {
      const ta = this.createdAtMs(a);
      const tb = this.createdAtMs(b);
      return this.historySort === 'newest' ? tb - ta : ta - tb;
    });

    this.displayTransactions = sorted;
    this.currentPage = 0;
    this.applyPage();
  }

  applyPage(): void {
    const start = this.currentPage * this.pageSize;
    this.pagedTransactions = this.displayTransactions.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.displayTransactions.length / this.pageSize));
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.applyPage();
  }

  onPageSizeChange(): void {
    this.currentPage = 0;
    this.applyPage();
  }

  private createdAtMs(tx: TransactionItem): number {
    if (!tx.createdAt) return 0;
    const ms = Date.parse(tx.createdAt);
    return Number.isFinite(ms) ? ms : 0;
  }

  private handleError(err: unknown): void {
    const e = err as {
      status?: number;
      error?: { message?: string; error?: string; code?: string };
      message?: string;
    };
    const body = e?.error;
    const code = body?.code || body?.error;
    const raw =
      body?.message ||
      (typeof body?.error === 'string' && body.error !== code ? body.error : undefined) ||
      e?.message ||
      'Request failed. Is the Firebase emulator running?';

    let friendly = raw;
    if (code === 'INSUFFICIENT_BALANCE' || /insufficient/i.test(raw)) {
      friendly = 'Insufficient balance';
    } else if (
      e?.status === 401 ||
      code === 'UNAUTHORIZED' ||
      /unauthorized|secret|signature/i.test(raw)
    ) {
      friendly = 'Webhook signature is invalid';
    }

    this.error = friendly;
    this.showToast(friendly, 'err');
  }

  private showToast(message: string, kind: 'ok' | 'err' | 'warn'): void {
    this.toastMessage = message;
    this.toastKind = kind;
    this.toastVisible = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
    }, 2800);
  }
}
