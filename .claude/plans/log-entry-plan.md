## log entry plan
- Add a path scoped rules file that dictates the following behavior for adding LogEntries to the database after the Engine executes a command that changes the app state in the following ways:
- A robot is placed
- An obstacle has been changed, include whether is was toggled on or not
- A command was queued, show the rId it was queued for, the command itself, and any parameters if the command includes them.
- After each tick occurs, log a report of each robot sorted by ascending id number, include the robot's rId, x position, y position, and direction.
- If a tick occurs and there are no robots, log EMPTY as the tick result
- Some of this will overlap with rules/commands.md, find the similarities and unify them in one place in the codebase
- The Log button on the frontend should send an API request to get all corresponding logs for the current floor and show them line by line in the modal.
- Adjust the Log modal close button to match the other buttons on the site. Use a X, make the cursor a pointer when hovering over it.