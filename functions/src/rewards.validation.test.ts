/**
 * Pure validation tests (no Firestore). Run: npm --prefix functions test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertActivityBody, HttpError } from "./rewards";

function expectHttpError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
    assert.fail("expected HttpError");
  } catch (err) {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
  }
}

const valid = {
  eventId: "evt_1",
  userId: "user_1",
  activityType: "purchase",
  points: 100,
};

describe("assertActivityBody", () => {
  it("accepts a valid payload", () => {
    const out = assertActivityBody(valid);
    assert.equal(out.points, 100);
    assert.equal(out.eventId, "evt_1");
  });

  it("rejects points = 0", () => {
    expectHttpError(() => assertActivityBody({ ...valid, points: 0 }), 400, "INVALID_POINTS");
  });

  it("rejects negative points", () => {
    expectHttpError(() => assertActivityBody({ ...valid, points: -10 }), 400, "INVALID_POINTS");
  });

  it("rejects decimal points", () => {
    expectHttpError(() => assertActivityBody({ ...valid, points: 1.5 }), 400, "INVALID_POINTS");
  });

  it("rejects string points", () => {
    expectHttpError(
      () => assertActivityBody({ ...valid, points: "100" as unknown as number }),
      400,
      "INVALID_POINTS"
    );
  });

  it("rejects missing eventId", () => {
    expectHttpError(
      () => assertActivityBody({ ...valid, eventId: "" }),
      400,
      "INVALID_EVENT_ID"
    );
  });

  it("rejects whitespace-only userId", () => {
    expectHttpError(
      () => assertActivityBody({ ...valid, userId: "   " }),
      400,
      "INVALID_USER_ID"
    );
  });
});
