---
paths:
  - "apps/web/**"
---

# Frontend rules (Angular)

- Use standalone components.
- Layout follows `diagrams/fleet-floor-interface-layout_v1.excalidraw`.
- Grid: default 10 x 8, max 20 x 20, origin 0,0.
- Cell clicks depend on Edit Mode: edit toggles Open/Obstacle; non-edit places a robot.
- Move / Turn Left / Turn Right are only enabled when a robot is selected, and are also bound to arrow keys.
- Talk to the backend over HTTP only; no direct engine or DB access.
