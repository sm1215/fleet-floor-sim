# fleet-floor-sim

A lightweight robot fleet floor simulator: an Angular client, a NestJS API, and a SQLite database. The design diagrams are in [`diagrams/`](diagrams/).

## Setup

### Prerequisites

- Node.js and npm (tested with Node 24.21)

### Install

From the repo root, install dependencies for both workspaces (`apps/api` and `apps/web`):

```sh
npm install
```

### Configure the API

Copy the env template:

macOS / Linux (bash, zsh):

```sh
cp apps/api/.env.example apps/api/.env
```

Windows (PowerShell):

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

| Variable      | Value in `.env.example` | Purpose                                                     |
| ------------- | ----------------------- | ----------------------------------------------------------- |
| `PORT`        | `3000`                  | Port the API listens on (falls back to `3000` if unset)     |
| `DB_PATH`     | `./data/fleet.sqlite`   | SQLite file path (required, the API won't start without it) |
| `CORS_ORIGIN` | `http://localhost:4200` | Origin allowed to call the API (the client). No fallback    |

### Database

Create the SQLite database and apply the schema by running the migrations from the repo root (after creating `apps/api/.env`):

```sh
npm run db:migrate
```

Run it again after pulling new migrations. The schema is only changed through migrations (TypeORM `synchronize` is off).

| Command                                                     | Purpose                                  |
| ----------------------------------------------------------- | ---------------------------------------- |
| `npm run db:migrate`                                        | Run pending migrations                   |
| `npm run db:migrate:generate -- database/migrations/<name>` | Generate a migration from entity changes |
| `npm run db:migrate:revert`                                 | Revert the last migration                |

## How to Run

Start the API and the client in two separate terminals, from the repo root:

```sh
npm run dev:api   # API at http://localhost:3000
```

```sh
npm run dev:web   # Client at http://localhost:4200
```

Open http://localhost:4200 in a browser.

### Other commands

| Command                                    | Purpose                          |
| ------------------------------------------ | -------------------------------- |
| `npm run build`                            | Build all workspaces             |
| `npm run test`                             | Run unit tests in all workspaces |
| `npm run test:e2e -w apps/api`             | Run the API e2e tests            |
| `npm run lint`                             | Lint all JS/TS                   |
| `npm run format`                           | Format with Prettier             |
| `npm run scenario -- path/to/scenario.txt` | Run a Scenario                   |

## Using the App

### The floor

- The floor starts at 10 x 8 (width x height). Use the width and height sliders to resize it, from 1 up to 20 on each axis. The size is saved.
- The origin `0,0` is the bottom-left cell. X grows to the east (right) and Y grows to the north (up).
- Each cell is either Open or an Obstacle. Robots show their ID (`R1`, `R2`, …) and an arrow for the direction they face.

### Robots and commands

- **Place a robot:** with Edit off and no robot selected, click an empty Open cell. New robots face North.
- **Select a robot:** click it. Click it again to deselect it, or click another robot to switch.
- **Reposition the selected robot:** click an empty Open cell to move it there directly.
- **Turn Left / Turn Right / Move:** these buttons are enabled only while a robot is selected. The arrow keys do the same: ← turns left, → turns right, ↑ moves. The arrow keys are ignored while the Log is open or a past tick is shown.
- **Delete:** removes the selected robot (button only, no confirmation).
- Commands are not applied right away. Each robot has a FIFO command queue, and every tick runs the next command of each robot. The queue panel shows the selected robot's queued commands.

### Edit mode

- **Edit: On / Off** switches what a cell click does. With Edit on, clicking a cell toggles it between Open and Obstacle. With Edit off, clicking places a robot.
- Clicking a robot selects it in either mode.

### Running the simulation

- **Step** runs one tick.
- **Play / Pause** runs ticks continuously, one per second (the rate is set in `apps/api/src/engine/engine.service.ts`).
- **Log** opens the full text history of user actions and tick results.
- **Reset All** clears the floor you're viewing (cells, robots, queues, log, history) and sets its tick back to 0. Other floors are untouched. Asks for confirmation.
- **Delete Floor** deletes the floor you're viewing, after a confirmation. Deleting the last floor creates a new 10 x 8 one.

### GOTO (Module A)

With a robot selected and Edit off, **Shift + click** an empty Open cell to send the robot there. The robot takes one step per tick along a shortest path around obstacles and other robots. If there is no path, it waits; after 3 ticks in a row with no path it gives up and an `UNREACHABLE` entry is logged. The queue panel shows the command as `GOTO x,y`.

### Timeline and forking (Module C)

The controls under the grid let you look back at any earlier tick of the current floor:

- Drag the **Tick** slider or type a tick number to view that tick. A past tick is read-only: everything that changes the floor is disabled, but you can still select robots to see their queue at that tick, and open the Log.
- Move the slider back to the latest tick to return to the live floor.
- **Fork From Here** copies the floor as it was at the shown tick into a new floor, pauses the simulation, and switches to the new floor. The original floor is unchanged.
- The **Floor** dropdown switches between floors.

## Scenario Runner

The Scenario Runner is a standalone script that loads a plain-text scenario file and runs it against the Engine directly (not over HTTP). It does not need the dev server running, and it uses an in-memory database, so the real SQLite file is never touched. Each run starts on a new 5 x 5 floor.

To run the first example scenario, run this from the repo root:

```sh
npm run scenario -- scenarios/scenario-1.txt
```

This builds the API into `apps/api/dist-scenario/` first, then runs the scenario. Each `REPORT` line in the file prints the robots' positions to stdout:

```text
R1 1,0,EAST
R2 2,0,EAST
R3 3,0,EAST
```

- Add `-s` (`npm run -s scenario -- …`) to keep npm's banner lines out of the output.
- A path that doesn't exist is looked up in `scenarios/`, so `npm run scenario -- scenario-1.txt` also works.
- Example scenarios are in [`scenarios/`](scenarios/), and their expected `REPORT` output is in [`scenarios/expected/`](scenarios/expected/).

### Scenario file format

A scenario is a plain-text file with one command per line:

| Line                                  | Example                    | Meaning                                                  |
| ------------------------------------- | -------------------------- | -------------------------------------------------------- |
| `FLOOR width,height`                  | `FLOOR 4,3`                | Resize the floor (default 5,5)                           |
| `OBSTACLE x,y`                        | `OBSTACLE 2,3`             | Toggle a cell between Open and Obstacle                  |
| `PLACE RId x,y,DIRECTION`             | `PLACE R1 0,0,EAST`        | Place a robot (or move an existing one)                  |
| `QUEUE RId CMD [CMD ...]`             | `QUEUE R2 MOVE RIGHT MOVE` | Queue one or more of `LEFT` / `RIGHT` / `MOVE`, in order |
| `LEFT RId` / `RIGHT RId` / `MOVE RId` | `MOVE R1`                  | Queue a single command                                   |
| `TICK [amount]`                       | `TICK 3`                   | Run ticks (default 1)                                    |
| `REPORT`                              | `REPORT`                   | Print every robot's position and direction               |

- Directions are `NORTH`, `EAST`, `SOUTH` and `WEST`. Coordinates use the same origin as the app (`0,0` is bottom-left, North is +y).
- Everything is case-insensitive. Blank lines and lines starting with `#` are ignored.
- An invalid line (unknown keyword, bad or missing params, extra tokens) is skipped silently, and the run continues. `GOTO` is not supported in scenarios.

## Tech Stack

- **Client:** Angular 22 (standalone components), Tailwind CSS 4
- **API:** NestJS 12
- **Database:** SQLite (better-sqlite3) with TypeORM; schema changes only through migrations
- **Tests:** Vitest in both workspaces
- **Lint / format:** ESLint (flat config) and Prettier

## Project Structure

```text
apps/web/                       Angular client
apps/api/                       NestJS API and the Scenario Runner
apps/api/database/migrations/   TypeORM migrations
apps/api/src/engine/            Engine (tick loop, step)
apps/api/src/queue/             Per-robot FIFO command queue
apps/api/src/pathfinding/       GOTO pathfinding (BFS)
apps/api/src/scenario/          Scenario Runner CLI
scenarios/                      Example scenarios and expected output
diagrams/                       Excalidraw design diagrams
```

The diagrams in [`diagrams/`](diagrams/) were the starting point for the build: the system overview, the interface layout and the database entities. The app has moved on since, so they don't show its current state.

## Modules Chosen

> I find Module C to be interesting from a troubleshooting perspective. If anything were to go wrong, a tool with this capability would be helpful to see the events leading up to a problem. It would also be useful from an auditing perspective, as proof that any given robot was at a specific place at said time.

> I also find Module A to be interesting from an automation perspective. It would be an impactful change to prioritize over other modules because it would have a ripple effect of efficiency across multiple areas.

- It would help eliminate interface fatigue for users and would provide for a better user experience.
- It would reduce the amount of work both the frontend and backend would require in terms of communicating individual interactions.
- It would also reduce the amount of queueing & logging that occurs and make the queue & log more succinct. It would be small, but it would also save on log file sizes.

## What's Missing

- UI polish. There's some awkward decisions that got crammed in while adding the modules because they introduce more complexity. I hadn't thought these parts through while doing the initial sketching and planning. For example, switching between floors occurs under the grid near the Fork button. Maybe it would be better suited elsewhere.
- The arrow representations of the robot's direction are small and could be hard to read.
- The log display is really minimal and just displays a wall of text. It's functional but there could be improvements on how to handle it. You can lose the close button on the top right while scrolling.
- There's no way to adjust the tick rate other than through the Engine service file on the backend.
- The error displays on the frontend are extra but they also are really minimal, these could be improved. I thought it was important for the user to have some kind of feedback somewhere, and this is where they landed.
- There's no way to undo a queued action once it is in the queue.
- It would be nice if there were a graphical representation of GOTO's predicted path when one is issued
- I didn't add any Scenarios of my own, time was a constraint here. It would be helpful to add edge cases to prove behavior followed the rules. It would also be helpful to add a Scenario with a GOTO command to support the recently added module.
- The other 2 modules, Module B: Battery and chargers and Module D: Multiple users in real time.
