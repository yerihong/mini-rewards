#!/usr/bin/env bash
# Smoke-test the core flow against the Functions emulator.
set -euo pipefail

API="${API_BASE:-http://127.0.0.1:3001}"
SECRET="${WEBHOOK_SECRET:-demo-secret}"
USER_ID="${USER_ID:-user_1}"
EVENT_ID="evt_demo_$(date +%s)"

echo "== health =="
curl -s "$API/health"
echo
echo
echo "== webhook earn ($EVENT_ID) =="
curl -s -X POST "$API/webhook/activity" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d "{\"eventId\":\"$EVENT_ID\",\"userId\":\"$USER_ID\",\"activityType\":\"purchase\",\"points\":100,\"partnerId\":\"partner_demo\"}"
echo

echo "== duplicate webhook (should not double-credit) =="
curl -s -X POST "$API/webhook/activity" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d "{\"eventId\":\"$EVENT_ID\",\"userId\":\"$USER_ID\",\"activityType\":\"purchase\",\"points\":100,\"partnerId\":\"partner_demo\"}"
echo

echo "== balance =="
curl -s "$API/users/$USER_ID/balance"
echo

echo "== redeem coffee =="
curl -s -X POST "$API/users/$USER_ID/redeem" \
  -H "Content-Type: application/json" \
  -d '{"rewardId":"reward_coffee"}'
echo

echo "== history =="
curl -s "$API/users/$USER_ID/transactions"
echo
