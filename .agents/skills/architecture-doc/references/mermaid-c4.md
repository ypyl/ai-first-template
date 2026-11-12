# Mermaid C4 Shapes

GitHub renders Mermaid `flowchart` blocks. It does not render `C4Context` or
`C4Container` blocks, so use the flowchart syntax below and keep the C4 meaning
through the legend and the shapes.

## Shape map

| C4 element | Mermaid | Class |
|---|---|---|
| Person | `(["Label"])` | `person` |
| Software system | `["Label"]` | `system` |
| Container | `["Label"]` | `container` |
| Database | `[("Label")]` | `store` |
| Queue | `[["Label"]]` | `store` |
| External system | `["Label"]` | `external` |
| Boundary | `subgraph id["Label"]` | none |

Use `<br/>` inside a label for a second line, for example
`api["API<br/>.NET 10"]`.

## Styles

```
classDef person fill:#08427B,color:#fff,stroke:#052E56
classDef system fill:#1168BD,color:#fff,stroke:#0B4884
classDef container fill:#438DD5,color:#fff,stroke:#2E6295
classDef store fill:#438DD5,color:#fff,stroke:#2E6295
classDef external fill:#999999,color:#fff,stroke:#666666,stroke-dasharray:5 5
```

External systems are dashed. Everything else follows the C4 blue palette.

## Context template

```mermaid
flowchart LR
  person(["Person: Customer"])

  system["Software System: Product"]

  ext["External: Email provider"]

  person -->|"Uses HTTPS"| system
  system -->|"Sends SMTP"| ext

  classDef person fill:#08427B,color:#fff,stroke:#052E56
  classDef system fill:#1168BD,color:#fff,stroke:#0B4884
  classDef external fill:#999999,color:#fff,stroke:#666666,stroke-dasharray:5 5

  class person person
  class system system
  class ext external
```

## Container template

```mermaid
flowchart TB
  person(["Person: Customer"])

  subgraph product["Software System: Product"]
    web["Web app<br/>React"]
    api["API<br/>.NET 10"]
    db[("Database<br/>PostgreSQL")]
    queue[["Queue<br/>SQS"]]
  end

  ext["External: Payment provider"]

  person -->|"Uses HTTPS"| web
  web -->|"Calls JSON/HTTPS"| api
  api -->|"Reads and writes SQL"| db
  api -->|"Publishes AMQP"| queue
  api -->|"Charges HTTPS"| ext

  classDef person fill:#08427B,color:#fff,stroke:#052E56
  classDef container fill:#438DD5,color:#fff,stroke:#2E6295
  classDef store fill:#438DD5,color:#fff,stroke:#2E6295
  classDef external fill:#999999,color:#fff,stroke:#666666,stroke-dasharray:5 5

  class person person
  class web,api container
  class db,queue store
  class ext external
```

## Rules

- One direction per diagram. Do not mix LR and TB.
- Keep labels short. Put the technology on the second line.
- Label every arrow with the intent and the protocol.
- Keep a diagram under about ten elements. Split it when it grows.
- Do not use `C4Context`, `C4Container`, `Person()`, or `Rel()` syntax. GitHub
  shows them as raw text.
