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

| Variable      | Default                 | Purpose                                     |
| ------------- | ----------------------- | ------------------------------------------- |
| `PORT`        | `3000`                  | Port the API listens on                     |
| `DB_PATH`     | `./data/fleet.sqlite`   | SQLite file path (required)                 |
| `CORS_ORIGIN` | `http://localhost:4200` | Origin allowed to call the API (the client) |

### Database

Migrations are not available yet. `npm run db:migrate` will be added.

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

## Modules Chosen
> I find Module C to be interesting from a troubleshooting perspective. If anything were to go wrong, a tool with this capability would be helpful to see the events leading up to a problem. It would also be useful from an auditing perspective, as proof that any given robot was at a specific place at said time. 

> I also find Module A to be interesting from an automation perspective. It would be an impactful change to prioritize over other modules because it would have a ripple effect of efficiency across mulitple areas. 
- It would help eliminate interface fatigue for users and would provide for a better user experience. 
- It would reduce the amount of work both the frontend and backend would require in terms of communicating invidual interactions.
- It would also reduce the amount of queueing & logging that occurs and make the queue & log more succint. It would be small, but it would also save on log file sizes.

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


