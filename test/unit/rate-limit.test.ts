import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  checkRateLimit,
  getClientIp,
  _resetAllStores,
  type RateLimitConfig,
} from "../../src/lib/rate-limit.ts";

const TEST_CONFIG: RateLimitConfig = {
  namespace: "test",
  maxAttempts: 3,
  windowMs: 60_000,
};

describe("rate limiter", () => {
  beforeEach(() => {
    _resetAllStores();
  });

  it("allows requests within the limit", () => {
    const r1 = checkRateLimit(TEST_CONFIG, "ip1");
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = checkRateLimit(TEST_CONFIG, "ip1");
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = checkRateLimit(TEST_CONFIG, "ip1");
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit(TEST_CONFIG, "ip2");
    }

    const blocked = checkRateLimit(TEST_CONFIG, "ip2");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it("isolates keys from each other", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit(TEST_CONFIG, "ip3");
    }

    const otherIp = checkRateLimit(TEST_CONFIG, "ip4");
    assert.equal(otherIp.allowed, true);
  });

  it("isolates namespaces from each other", () => {
    const otherConfig: RateLimitConfig = {
      namespace: "other",
      maxAttempts: 3,
      windowMs: 60_000,
    };

    for (let i = 0; i < 3; i++) {
      checkRateLimit(TEST_CONFIG, "ip5");
    }

    const otherNs = checkRateLimit(otherConfig, "ip5");
    assert.equal(otherNs.allowed, true);
  });
});

describe("getClientIp", () => {
  it("extracts the first IP from x-forwarded-for", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    assert.equal(getClientIp(request), "1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    assert.equal(getClientIp(request), "9.8.7.6");
  });

  it("returns unknown when no IP headers are present", () => {
    const request = new Request("http://localhost/");
    assert.equal(getClientIp(request), "unknown");
  });
});
