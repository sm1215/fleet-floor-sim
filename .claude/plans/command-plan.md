## command plan
- Add a path scoped rules file that dictates the following commands and their expected behaviors. - These commands should be endpoints that are reflected in `apps\api`.

LEFT:
- Takes a robot id param and updates it's direction to rotate counter-clockwise in place. 
- The change should be persisted in the database.

RIGHT:
- Takes a robot id param and updates it's direction to rotate clockwise in place. 
- The change should be persisted in the database.

MOVE:
- Takes a robot id param and tries to move its position forward by one cell in whatever direction it is facing. 
- It cannot leave the grid boundaries. 
- It cannot move into a cell marked as an obstacle in the database. 
- All moves of all robots must be resolved together in the same turn, or tick (see apps\engine).
- If two or more robots are configured to move into the same cell in the same tick, the robot with the lower numerical ID wins. The other robot cannot move.
- If two robots try to move into each others' cells, they cannot move.
- A robot can move into a cell that is occupied at the start of the tick as long as it is occupied by a robot that is leaving that cell by the end of the tick. If the occupying robot doesn't move, then the first robot cannot either.
- Account for rotation. If there are four robots all trying to move into each others' cells in a closed circular loop, they should all succeed.
- If a MOVE is blocked, a reason must be given. Use the following:
- If trying to move outside the grid boundary: "Blocked by wall"
- If trying to move into a cell that is an obstacle: "Blocked by obstacle"
- If trying to move into a cell that is occupied: "Blocked by \"R<ID>\"". Give the blocking Robot's ID with an "R" prefix.

FLOOR:
- Accepts 2 int params for width and height, with default values of 5 for each.
- Creates a floor in the database if one doesn't exist. Updates one if it does.
- The params accepted for this endpoint should be used to update the entry in the database.

OBSTACLE:
- Requires 2 int params for X and Y. If they aren't provided, ignore the request.
- Flags the obstacle column as true for a corresponding cell from the database that matches the params provided. If no cell is found, ignore the request.

PLACE:
- Requires an RId string param that begins with an uppercase "R", followed by a number. Parse the integer from RId and store it as DisplayId.
- Requires an X integer
- Requires a Y integer
- Requires a Direction string that corresponds to the Direction mapping provided in `apps\web\src\app\models\direction.ts`

**Change the Robots table to have a displayId that is separate from the internal primary key id**
- Query the database to see if a robot exists with a matching DisplayId. 
- If it does, update that robot's coordinates (cell) to match the ones provided. Change the direction to the direction provided as the param.
- If it doesn't exist, create a new one at the specified coordinates (cell) and set it's direction appropriately.

QUEUE:
- Requires an RId string param that begins with an uppercase "R", followed by a number. Parse the integer from RId and store it as DisplayId.
- Requires a Command string param that matches the valid commands for a robot: "LEFT", "RIGHT", "MOVE".
- If any required params are missing or don't match, ignore this request.

TICK:
- Requires an Amount integer param. Defaults to 1.
- Calls the Step function in `apps\engine` a number of times as provided in the Amount param.

REPORT:
- Query each robot, sorted by ascending DisplayId.
- Assemble an RId like `R${DisplayId}`.
- Get the robot's coordinates from the cell it belongs to as X and Y.
- Get the robot's Direction in English from the corresponding direction map `apps\web\src\app\models\direction.ts`.
- Print 1 line per robot to stdout formatted as `${RId} ${X}, ${Y}, ${Direction}`.
- If there are no robots, print "EMPTY".

