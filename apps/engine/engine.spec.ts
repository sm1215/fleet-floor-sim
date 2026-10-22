import { doNext } from '../queue/do-next.js';
import { Engine } from './engine.js';

vi.mock('../queue/do-next.js', () => ({ doNext: vi.fn() }));

const doNextMock = vi.mocked(doNext);

describe('Engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    doNextMock.mockReset();
    doNextMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at tick 0, tickRate 1000, not running', () => {
    const engine = new Engine();
    expect(engine.currentTick).toBe(0);
    expect(engine.tickRate).toBe(1000);
    expect(engine.running).toBe(false);
  });

  it('step() increments currentTick by 1 and calls doNext()', async () => {
    const engine = new Engine();
    await engine.step();
    await engine.step();
    expect(engine.currentTick).toBe(2);
    expect(doNextMock).toHaveBeenCalledTimes(2);
  });

  it('step() waits for doNext() to resolve', async () => {
    let resolve!: () => void;
    doNextMock.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const engine = new Engine();
    let done = false;
    const stepping = engine.step().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    resolve();
    await stepping;
    expect(done).toBe(true);
  });

  it('step() rejects with the doNext() error', async () => {
    doNextMock.mockRejectedValue(new Error('boom'));
    await expect(new Engine().step()).rejects.toThrow('boom');
  });

  it('toggle() runs step() every tickRate ms until toggled off', async () => {
    const engine = new Engine();
    engine.toggle();
    expect(engine.running).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(engine.currentTick).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.currentTick).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.currentTick).toBe(3);

    engine.toggle();
    expect(engine.running).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(engine.currentTick).toBe(3);
  });

  it('uses the current tickRate', async () => {
    const engine = new Engine();
    engine.tickRate = 250;
    engine.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.currentTick).toBe(4);
    engine.stop();
  });

  it('while running, a failed step goes to onError and running continues', async () => {
    const onError = vi.fn();
    const error = new Error('boom');
    doNextMock.mockRejectedValueOnce(error);
    const engine = new Engine(onError);
    engine.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith(error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.currentTick).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    engine.stop();
  });

  it('does not start the next step until the current one settles', async () => {
    let resolve!: () => void;
    doNextMock.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
    const engine = new Engine();
    engine.toggle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(doNextMock).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(doNextMock).toHaveBeenCalledTimes(2);
    engine.stop();
  });

  it('pausing and resuming during a pending step keeps a single timer chain', async () => {
    let resolve!: () => void;
    doNextMock.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
    const engine = new Engine();
    engine.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.currentTick).toBe(1);

    engine.toggle();
    engine.toggle();
    resolve();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.currentTick).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.currentTick).toBe(3);
    engine.stop();
  });
});
