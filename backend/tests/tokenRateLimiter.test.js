import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenRateLimiter } from '../src/utils/tokenRateLimiter.js';

/** A fake clock: sleep() moves time forward instantly. */
function fakeClock() {
  const clock = { time: 0, slept: [] };
  clock.now = () => clock.time;
  clock.sleep = async (ms) => { clock.slept.push(ms); clock.time += ms; };
  return clock;
}

test('lets requests through while they fit in the per-minute budget', async () => {
  const clock = fakeClock();
  const limiter = new TokenRateLimiter(() => 16_000, clock);
  assert.equal(await limiter.acquire(10_000), 0);
  assert.equal(await limiter.acquire(6_000), 0);
  assert.deepEqual(clock.slept, []);
});

test('waits until the oldest request leaves the one-minute window', async () => {
  const clock = fakeClock();
  const limiter = new TokenRateLimiter(() => 16_000, clock);
  await limiter.acquire(12_000);
  clock.time = 10_000;
  const waited = await limiter.acquire(12_000);
  assert.equal(waited, 50_250, 'waited until 60s after the first request (+250ms margin)');
});

test('an oversized request is allowed when the window is empty', async () => {
  const clock = fakeClock();
  const limiter = new TokenRateLimiter(() => 16_000, clock);
  assert.equal(await limiter.acquire(20_000), 0);
});

test('pause() blocks requests until the retry delay has passed', async () => {
  const clock = fakeClock();
  const limiter = new TokenRateLimiter(() => 16_000, clock);
  limiter.pause(45_000);
  assert.equal(await limiter.acquire(100), 45_000);
});

test('reads the limit on every call', async () => {
  const clock = fakeClock();
  let limit = 16_000;
  const limiter = new TokenRateLimiter(() => limit, clock);
  await limiter.acquire(15_000);
  limit = 100_000;
  assert.equal(await limiter.acquire(15_000), 0);
});
