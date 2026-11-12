---
name: architecture-doc
description: "Document or refresh the project architecture as a C4 model. Use when asked for architecture docs or diagrams, when starting a project, or when an L2/L3 change adds or removes a container, store, queue, external system, or trust boundary."
---

# Architecture Doc

Write `ARCHITECTURE.md` from evidence in the repository. Use the C4 Context and
Container abstractions. Render with Mermaid `flowchart`, not Mermaid C4, because
GitHub does not render C4 blocks and the document must be readable in the repo.

The diagram is the map. The ADR is the decision. The spec is the behavior. Keep
them separate and link them.

## When

- On request: "document the architecture", "create a C4 model", "update the
  architecture doc".
- At the end of an L2 or L3 change that adds or removes a container, store,
  queue, external system, or trust boundary.
- At the end of a goal, to check the doc still matches the repo.

Not for every change. Code inside a container does not change the architecture.

## 1. Name the system and the people

State the software system in one sentence. List the people and external systems
that interact with it. If the boundary is not obvious from the repo, ask.

## 2. Gather evidence

Read, do not guess:

- manifests and lockfiles
- Dockerfile, compose, IaC, deploy config
- entry points: routes, CLI commands, workers, cron
- stores: database, cache, object storage, files
- queues and topics
- external clients: payment, email, auth, model providers
- environment variables that name an external service

Every container needs a path or a deployable. Every external system needs a
client or config path. If you cannot find it, write it under Open questions.
Never invent an element.

## 3. Write the Context view

People, the system, external systems. No containers. Use `references/mermaid-c4.md`
for the shapes and the legend.

## 4. Write the Container view

Deployable units, stores, queues, external systems, and the relationships
between them. Label each relationship with what crosses it and the protocol.

Keep the diagram to about ten elements. Split by subsystem when it grows.

## 5. Write the file

`ARCHITECTURE.md`:

- Last verified date and commit
- Context diagram
- Container diagram
- Legend: shape to C4 element
- Container table: container, responsibility, path, technology
- Open questions
- Links to the ADRs and specs that explain the decisions

## 6. Check

- Every container has a path or a deployable.
- Every external system has a client or config path.
- Every relationship has a direction and a protocol.
- No element appears without evidence.
- The Mermaid blocks use `flowchart`, not `C4Context` or `C4Container`.
- The doc matches the current repo, not the previous doc.

## Rules

- Context and Container only by default. Component on request for a complex
  container. Code never.
- No PNG or SVG. The Mermaid source is the artifact and GitHub renders it.
- No Structurizr, LikeC4, PlantUML, or Docker. If the project needs strict C4
  notation or an interactive explorer, that is an L2 decision.
- The architecture doc records shape. The ADR records why. Do not duplicate.
