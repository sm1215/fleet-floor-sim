import type { LogEntry } from '../../database/entities/index.js';
import { planResize } from '../floor/floor.model.js';
import { parseGotoParams } from '../queue/queue.service.js';
import { DIRECTION_NAMES, GOTO } from '../shared/types.js';
import type { FloorState } from './floor-state.js';

type Entry = Pick<LogEntry, 'action' | 'params' | 'result'>;
type StateCell = FloorState['cells'][number];
type StateRobot = FloorState['robots'][number];

const toDirection = (name: string) =>
  DIRECTION_NAMES.indexOf(name as (typeof DIRECTION_NAMES)[number]);

/** `R12` → 12. */
const displayIdOf = (rId: string) => Number(rId.slice(1));

function openCells(width: number, height: number): StateCell[] {
  const cells: StateCell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) cells.push({ x, y, obstacle: false });
  }
  return cells;
}

function sorted(state: FloorState): FloorState {
  return {
    ...state,
    cells: [...state.cells].sort((a, b) => a.y - b.y || a.x - b.x),
    robots: [...state.robots].sort((a, b) => a.displayId - b.displayId),
  };
}

/** Same plan as a live resize, so displaced robots land on the same cells. */
function resize(state: FloorState, width: number, height: number): FloorState {
  const cellIndex = (x: number, y: number) =>
    state.cells.findIndex((c) => c.x === x && c.y === y);
  const plan = planResize(
    { width, height },
    state.cells.map((c, id) => ({
      id,
      obstacle: c.obstacle,
      xPosition: c.x,
      yPosition: c.y,
    })),
    state.robots.map((r) => ({ id: r.id, cellId: cellIndex(r.x, r.y) })),
  );
  if (!plan) return state;
  const cells = [
    ...state.cells.filter((_, id) => !plan.deleteCellIds.includes(id)),
    ...plan.create.map(({ x, y }) => ({ x, y, obstacle: false })),
  ];
  const robots = state.robots.map((r) => {
    const move = plan.moves.find((m) => m.robotId === r.id);
    return move ? { ...r, x: move.to.x, y: move.to.y } : r;
  });
  return { width, height, cells, robots };
}

function place(state: FloorState, params: string): FloorState {
  // `R1 2, 3, NORTH`
  const [rId, x, y, direction] = params.split(/,?\s+/);
  const displayId = displayIdOf(rId);
  const at = { x: Number(x), y: Number(y), direction: toDirection(direction) };
  if (state.robots.some((r) => r.displayId === displayId)) {
    return {
      ...state,
      robots: state.robots.map((r) =>
        r.displayId === displayId ? { ...r, ...at } : r,
      ),
    };
  }
  const id = Math.max(0, ...state.robots.map((r) => r.id)) + 1;
  return {
    ...state,
    robots: [...state.robots, { id, displayId, ...at, queue: [] }],
  };
}

/**
 * A queue head is used up by the tick, except a GOTO, which stays until the
 * robot ends the tick on its target or gives up (pathfinding.md).
 */
function headDone(robot: StateRobot): boolean {
  const [command, params] = robot.queue[0]?.split(' ') ?? [];
  if (command !== GOTO || robot.gaveUp) return true;
  const target = parseGotoParams(params);
  return !target || (target.x === robot.x && target.y === robot.y);
}

function tick(state: FloorState, result: string): FloorState {
  const reported = new Map<number, Pick<StateRobot, 'x' | 'y' | 'direction'>>();
  if (result !== 'EMPTY') {
    for (const line of result.split('\n')) {
      // `R1 2,3,NORTH`
      const [rId, at] = line.split(' ');
      const [x, y, direction] = at.split(',');
      reported.set(displayIdOf(rId), {
        x: Number(x),
        y: Number(y),
        direction: toDirection(direction),
      });
    }
  }
  return {
    ...state,
    robots: state.robots.map((r) => {
      const moved = { ...r, ...reported.get(r.displayId) };
      const queue = headDone(moved) ? moved.queue.slice(1) : moved.queue;
      delete moved.gaveUp;
      return { ...moved, queue };
    }),
  };
}

/** The state after one log entry (timeline.md). Never mutates `state`. */
export function applyEntry(state: FloorState, entry: Entry): FloorState {
  const { action, params, result } = entry;
  switch (action) {
    case 'FLOOR': {
      // `5, 5, CREATED` / `5, 5, RESIZED`
      const [width, height, change] = params.split(', ');
      const w = Number(width);
      const h = Number(height);
      if (change === 'CREATED') {
        return { width: w, height: h, cells: openCells(w, h), robots: [] };
      }
      return sorted(resize(state, w, h));
    }
    case 'OBSTACLE': {
      // `2, 3, ON`
      const [x, y, on] = params.split(', ');
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.x === Number(x) && c.y === Number(y)
            ? { ...c, obstacle: on === 'ON' }
            : c,
        ),
      };
    }
    case 'PLACE':
      return sorted(place(state, params));
    case 'QUEUE': {
      // `R1 MOVE LEFT` / `R1 GOTO 3,4`
      const [rId, ...commands] = params.split(' ');
      const displayId = displayIdOf(rId);
      const items = commands[0] === GOTO ? [commands.join(' ')] : commands;
      return {
        ...state,
        robots: state.robots.map((r) =>
          r.displayId === displayId
            ? { ...r, queue: [...r.queue, ...items] }
            : r,
        ),
      };
    }
    case 'UNREACHABLE': {
      // `R1 3, 4`: written before its tick's TICK entry.
      const displayId = displayIdOf(params.split(' ')[0]);
      return {
        ...state,
        robots: state.robots.map((r) =>
          r.displayId === displayId ? { ...r, gaveUp: true as const } : r,
        ),
      };
    }
    case 'DELETE': {
      const displayId = displayIdOf(params);
      return {
        ...state,
        robots: state.robots.filter((r) => r.displayId !== displayId),
      };
    }
    case 'TICK':
      return tick(state, result);
    default:
      return state;
  }
}
