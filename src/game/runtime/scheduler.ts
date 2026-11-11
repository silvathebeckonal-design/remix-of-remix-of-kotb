// Minimal coroutine scheduler mirroring Unity's WaitForSeconds / WaitUntil semantics.
type Timer = { at: number; resolve: () => void };
type Cond = { fn: () => boolean; resolve: () => void };
type Tween = { start: number; dur: number; fn: (t: number) => void; resolve: () => void };

export class Scheduler {
  time = 0;
  private timers: Timer[] = [];
  private conds: Cond[] = [];
  private tweens: Tween[] = [];
  private disposed = false;

  update(dt: number) {
    if (this.disposed) return;
    this.time += dt;
    const now = this.time;
    if (this.tweens.length) {
      const keep: Tween[] = [];
      for (const tw of this.tweens) {
        const t = tw.dur <= 0 ? 1 : Math.min(1, (now - tw.start) / tw.dur);
        tw.fn(t);
        if (t >= 1) tw.resolve();
        else keep.push(tw);
      }
      this.tweens = keep;
    }
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) t.resolve();
    }
    if (this.conds.length) {
      const keep: Cond[] = [];
      for (const c of this.conds) {
        if (c.fn()) c.resolve();
        else keep.push(c);
      }
      this.conds = keep;
    }
  }

  wait(seconds: number): Promise<void> {
    if (this.disposed) return new Promise(() => {});
    return new Promise((resolve) => this.timers.push({ at: this.time + Math.max(0, seconds), resolve }));
  }

  /** Resolves on a later frame once fn() is true (like WaitUntil / while-yield loops). */
  until(fn: () => boolean): Promise<void> {
    if (this.disposed) return new Promise(() => {});
    return new Promise((resolve) => this.conds.push({ fn, resolve }));
  }

  frame(): Promise<void> {
    return this.until(() => true);
  }

  tween(dur: number, fn: (t: number) => void): Promise<void> {
    if (this.disposed) return new Promise(() => {});
    fn(0);
    return new Promise((resolve) => this.tweens.push({ start: this.time, dur, fn, resolve }));
  }

  dispose() {
    this.disposed = true;
    this.timers = [];
    this.conds = [];
    this.tweens = [];
  }
}

/** Ease approximating Unity's 2-key AnimationCurve with unit tangents. */
export const easeInOut = (t: number) => t * t * (3 - 2 * t);
