import type { EngineService } from '../engine/engine.service.js';
import { Direction } from '../shared/types.js';
import { runScenario } from './run-scenario.js';

describe('runScenario', () => {
  let engine: {
    scenarioMode: boolean;
  } & Record<
    'floor' | 'obstacle' | 'place' | 'queue' | 'tick' | 'report' | 'clear',
    ReturnType<typeof vi.fn>
  >;
  let write: ReturnType<typeof vi.fn<(out: string) => void>>;

  beforeEach(() => {
    engine = {
      scenarioMode: false,
      floor: vi.fn().mockResolvedValue({ ok: true }),
      obstacle: vi.fn().mockResolvedValue({ ok: true }),
      place: vi.fn().mockResolvedValue({ ok: true }),
      queue: vi.fn().mockResolvedValue({ ok: true }),
      tick: vi.fn().mockResolvedValue({ ok: true }),
      report: vi.fn().mockResolvedValue(['R1 0,0,NORTH']),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    write = vi.fn<(out: string) => void>();
  });

  const run = (text: string) =>
    runScenario(engine as unknown as EngineService, text, write);

  it('sets scenarioMode and starts a 5x5 floor', async () => {
    await run('');
    expect(engine.scenarioMode).toBe(true);
    expect(engine.floor.mock.calls[0]).toEqual([5, 5]);
  });

  it('dispatches each command', async () => {
    await run(
      [
        'FLOOR 4,3',
        'OBSTACLE 2,1',
        'PLACE R1 0,0,EAST',
        'QUEUE R1 MOVE LEFT',
        'MOVE R1',
        'TICK 2',
        'REPORT',
      ].join('\r\n'),
    );
    const names = [
      'floor',
      'obstacle',
      'place',
      'queue',
      'tick',
      'report',
    ] as const;
    const order = names
      .flatMap((name) =>
        engine[name].mock.invocationCallOrder.map((at) => ({ name, at })),
      )
      .sort((x, y) => x.at - y.at)
      .map((call) => call.name);
    expect(order).toEqual([
      'floor',
      'floor',
      'obstacle',
      'place',
      'queue',
      'queue',
      'tick',
      'report',
    ]);
    expect(engine.floor.mock.calls[1]).toEqual([4, 3]);
    expect(engine.obstacle).toHaveBeenCalledWith(2, 1);
    expect(engine.place).toHaveBeenCalledWith(1, 0, 0, Direction.E);
    expect(engine.queue.mock.calls).toEqual([
      [1, ['MOVE', 'LEFT']],
      [1, ['MOVE']],
    ]);
    expect(engine.tick).toHaveBeenCalledWith(2);
  });

  it('skips blank, # and invalid lines', async () => {
    await run(
      ['', '# PLACE R1 0,0,EAST', 'JUMP R1', 'PLACE R1', 'TICK'].join('\n'),
    );
    expect(engine.place).not.toHaveBeenCalled();
    expect(engine.floor).toHaveBeenCalledTimes(1);
    expect(engine.tick).toHaveBeenCalledWith(1);
  });

  it('writes only REPORT output', async () => {
    await run('PLACE R1 0,0,NORTH\nREPORT\nTICK\nREPORT');
    expect(write.mock.calls).toEqual([['R1 0,0,NORTH\n'], ['R1 0,0,NORTH\n']]);
  });

  it('continues after a line whose engine call throws', async () => {
    engine.place.mockRejectedValueOnce(new Error('db down'));
    await run('PLACE R1 0,0,NORTH\nTICK');
    expect(engine.tick).toHaveBeenCalledWith(1);
  });

  it('continues when the starting floor call throws', async () => {
    engine.floor.mockRejectedValueOnce(new Error('db down'));
    await expect(run('TICK')).resolves.toBeUndefined();
    expect(engine.tick).toHaveBeenCalledWith(1);
    expect(engine.clear).toHaveBeenCalledTimes(1);
  });

  it('clears the floor even when a line throws', async () => {
    engine.place.mockRejectedValueOnce(new Error('db down'));
    await run('PLACE R1 0,0,NORTH');
    expect(engine.clear).toHaveBeenCalledTimes(1);
  });
});
