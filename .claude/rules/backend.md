---
paths:
  - "apps/api/**"
---

# Backend rules (NestJS)

- Follow module → controller → service layering. Controllers handle HTTP only; put logic in services.
- Validate all incoming request bodies with DTOs.
- Keep the Engine free of HTTP concerns — it must be callable directly by the scenario runner.
- The scenario runner is a standalone script, separate from the dev server. It takes a plain-text file path: `npm run scenario -- path/to/scenario.txt`.
- Each robot's command queue is FIFO.
