## queue plan
- Create a path scoped rules file for `apps\queue`. It should follow the following behaviors:
- The queue should live in `apps\queue`.
- The queue should provide a function called DoNext (match previous casing) that retrieves all robots in ascending order based on their ID, and executes their next queuedCommand, also found in the database. 
- The DoNext function should return a promise.
- The DoNext function should parse the command and return it as part of the response. The Engine should be calling the queue and will handle the command there.
- As part of the function's execution, it should remove the executed command from the database regardless of success or failure.