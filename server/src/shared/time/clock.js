/**
 * Central clock abstraction.
 * Policy: application clock (this module) is the primary authority for
 * scheduling calculations. Transaction-sensitive handlers should call
 * clock.nowMs() / clock.nowIso() rather than scattered Date.now().
 * SQLite TEXT stores ISO-8601 UTC from nowIso(). Host OS TZ does not affect
 * ISO output; IANA zone math uses Intl (ICU) data.
 */

let _offsetMs = 0;
let _frozenMs = null;

export class SystemClock {
  nowMs() {
    if (_frozenMs != null) return _frozenMs;
    return Date.now() + _offsetMs;
  }

  now() {
    return new Date(this.nowMs());
  }

  nowIso() {
    return new Date(this.nowMs()).toISOString();
  }
}

/** Test / admin clock: freeze or offset real time. */
export class FakeClock extends SystemClock {
  constructor(initialMs = Date.now()) {
    super();
    this.freeze(initialMs);
  }

  freeze(ms) {
    _frozenMs = typeof ms === "number" ? ms : new Date(ms).getTime();
  }

  advance(ms) {
    if (_frozenMs == null) _frozenMs = Date.now();
    _frozenMs += ms;
  }

  unfreeze() {
    _frozenMs = null;
  }

  setOffset(ms) {
    _offsetMs = ms || 0;
  }
}

export const clock = new SystemClock();

/** Reset fake clock state (tests). */
export function resetClockState() {
  _offsetMs = 0;
  _frozenMs = null;
}

export function installFakeClock(initialMs) {
  const fake = new FakeClock(initialMs);
  return fake;
}
