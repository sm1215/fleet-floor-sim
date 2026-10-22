# Decisions

#### Diagrams
> I've chosen to diagram my system, initial interface layout, and some data models in Exalidraw and have included them in the /diagrams directory.

#### Rules
> I'm choosing to write path based rules for different sections of the stack to dictate to Claude expected behaviors, responsibilities for that section, testing, etc... When something needs updated, the rule for that part of the app is also updated.

#### Plans
> I'm leaving my plans in a .claude/plans directory as a means of preserving my AI history. In some sections I draft a plain English plan that I then feed into Claude to have it generate its own plan from. This is part of me being open / honest about my process.

#### The floor is described as having minimum and maximum values of 1 - 20 but the origin point is described as 0, 0. Should the grid be zero-based?
> I will program the grid as zero based in code but accept user input in the requested numerical ranges.

#### The initial floor describes a default size of 10 x 8 but there is a request for the Scenario Runner to default to 5 x 5. The Scenario Runner deviates from the requested application defaults. Should be fine, but it stands out as a point of inconsistency. It would be better if these values were aligned so we could rely on one default behavior.
> I will prefer to default to a single source of truth as a best practice and choose to support a size of 5 x 5 because that's what will be explicitly tested for.

#### The request for a full log to be shown in the UI
> I'm choosing to include this functionality in a standalone modal because it could be an extensive list and I can enable vertical scrolling in a contained height with a modal setup.

#### There's not an easy way to clear robots because I've purposefully built everything to persist.
> I'm adding a delete button for individual robots, and a reset button for the entire floor to reload from a default state. I'm preferring for the reset to perform as clean of a reset as possible, where the robots are delete, the associated log history, and the cells are recreated so obstacles are also cleared. The floor itself can persist in the db, but it will revert to the default size. I'm leaving the floor exist because it's a reset button, as opposed to a "New" button. So, a small distinction.

#### There's no specification for error handling
> I chose to include feedback for the user in the event of an error. I put it beneath the grid in a stackable fashion.

#### Making a choice to show planar labels on the grid so its easier to identify robot positioning

#### Scenario Runner TICK command doesn't require an upper bound
> I'm specifying one for 99 so the program doesn't hang