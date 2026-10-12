// Keeps requests under a tokens-per-minute budget by waiting before sending.
// One limiter is shared by all requests, because the Gemini quota is per API key and model.

const WINDOW_MS = 60_000;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class TokenRateLimiter {
  /**
   * @param {() => number} getLimit tokens allowed per minute (read on every call, so .env changes apply)
   * @param {{ now?: () => number, sleep?: (ms: number) => Promise<void> }} [clock] injectable for tests
   */
  constructor(getLimit, { now = Date.now, sleep = realSleep } = {}) {
    this.getLimit = getLimit;
    this.now = now;
    this.sleep = sleep;
    this.entries = []; // { time, tokens } for requests in the last minute
    this.blockedUntil = 0;
  }

  usedTokens() {
    const cutoff = this.now() - WINDOW_MS;
    this.entries = this.entries.filter((e) => e.time > cutoff);
    return this.entries.reduce((sum, e) => sum + e.tokens, 0);
  }

  /** Waits until `tokens` fit in the budget, then records them. Returns the time waited in ms. */
  async acquire(tokens) {
    const started = this.now();
    for (;;) {
      const now = this.now();
      if (now < this.blockedUntil) {
        await this.sleep(this.blockedUntil - now);
        continue;
      }
      const used = this.usedTokens();
      // An oversized request is allowed when nothing else is in the window, so it cannot wait forever.
      if (used + tokens <= this.getLimit() || this.entries.length === 0) {
        this.entries.push({ time: now, tokens });
        return now - started;
      }
      const oldest = this.entries[0];
      await this.sleep(oldest.time + WINDOW_MS - now + 250);
    }
  }

  /** After a 429: send nothing until `ms` from now. */
  pause(ms) {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }
}
