# Decisions

#### Diagrams
> I've chosen to diagram my system, initial interface layout, and some data models in Exalidraw and have included them in the /diagrams directory.

#### The floor is described as having minimum and maximum values of 1 - 20 but the origin point is described as 0, 0. Should the grid be zero-based?
> I will program the grid as zero based in code but accept user input in the requested numerical ranges.

#### The initial floor describes a default size of 10 x 8 but there is a request for the Scenario Runner to default to 5 x 5. The Scenario Runner deviates from the requested application defaults. Should be fine, but it stands out as a point of inconsistency. It would be better if these values were aligned so we could rely on one default behavior.
> I will prefer to default to a single source of truth as a best practice and choose to support a size of 5 x 5 because that's what will be explicitly tested for.

#### The request for a full log to be shown in the UI
> I'm choosing to include this functionality in a standalone modal because it could be an extensive list and I can enable vertical scrolling in a contained height with a modal setup.

