import { WriteLock } from './write-lock.js';

describe('WriteLock', () => {
  it('runs one task at a time, in call order', async () => {
    const lock = new WriteLock();
    const events: string[] = [];
    let release!: () => void;
    const first = lock.run(async () => {
      events.push('first start');
      await new Promise<void>((r) => (release = r));
      events.push('first end');
    });
    const second = lock.run(() => {
      events.push('second');
      return Promise.resolve();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['first start']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first start', 'first end', 'second']);
  });

  it('returns the task result, and a failed task does not block the next', async () => {
    const lock = new WriteLock();
    await expect(
      lock.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(lock.run(() => Promise.resolve(7))).resolves.toBe(7);
  });
});
