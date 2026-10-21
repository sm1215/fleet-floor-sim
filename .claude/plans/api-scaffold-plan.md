## api-scaffold-plan
In NestJS, scaffold the following API endpoints. Use the following folder structure

apps/
└── api/
    ├── src/
    │   ├── main.ts                 # Application entry point
    │   ├── floor/
    │   │   ├── floor.model.ts       # 2D Floor logic (dimensions, obstacles, cell states)
    │   │   └── floor.service.ts     # Floor state management (occupancy tracker)
    |   |   cell/
    │   │   ├── cell.model.ts       # C logic (id, x, y, state)
    │   │   └── cell.service.ts     # Cell state management
    │   ├── robot/
    │   │   ├── robot.entity.ts     # Robot data model (id, x, y, status)
    │   │   └── robot.service.ts    # Direct robot actions (turn, move, report_state)
    │   ├── log-entry/
    │   │   ├── log-entry.entity.ts 
    │   │   └── log-entry.service.ts
    │   ├── queued-command/
    │   │   ├── queued-command.entity.ts 
    │   │   └── queued-command.service.ts
    │   └── shared/
    │       └── types.ts            # Common definitions (Position, Direction, Command)
    ├── tests/                      # Simulation and unit tests

Requirements:
Create separate endpoints for each entity to Create, Read, Update, Delete for Floor, Cell, Robot, Log Entry, and Queued Command. 

Create tests for each endpoint that return stubbed data for each of those calls to prove they are working.

Intent:
Have a basic structure that can communicate with the frontend and database