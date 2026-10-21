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

| Command                        | Purpose                          |
| ------------------------------ | -------------------------------- |
| `npm run build`                | Build all workspaces             |
| `npm run test`                 | Run unit tests in all workspaces |
| `npm run test:e2e -w apps/api` | Run the API e2e tests            |
| `npm run lint`                 | Lint all JS/TS                   |
| `npm run format`               | Format with Prettier             |

## Scenario Runner

Not implemented yet. Planned usage:

```sh
npm run scenario -- path/to/scenario.txt
```

It will load a plain-text scenario file and run it against the Engine directly (not over HTTP). The scenario file format is still to be defined.

## Modules Chosen

## What's Missing
