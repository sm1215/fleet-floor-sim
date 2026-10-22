## engine plan
- Create a path scoped rules file for `apps\engine`. The engine should live in `apps\engine`. 
- The engine should have a currentTick property and a tickRate property. 
- The currentTick should start at 0 and increment by 1.
- The tickRate should default to 1000. It is a millisecond representation.
- The engine should have a running boolean.
- The engine should provide a Step (match previous casing) function that increments the currentTick by 1.
When running is true, the engine should call step automatically at the prescribed tickrate.
- The API should provide an endpoint to call the Step function manually.
- The API should provide an endpoint to toggle the running boolean on and off.
- The Step function should call the DoNext function that will be provided in `app\queue`.
- The Step function should wait until all promises resolve. If an error occurs, report it back the frontend to be displayed under the grid.


