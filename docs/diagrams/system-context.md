# System Context

## Status

Conceptual architecture for the first usable version. Logical components shown here do not imply separate microservices or deployment units.

```mermaid
flowchart TB
    Candidate[Candidate]
    Dashboard[Web Dashboard]
    App[Application and API Layer]
    Core[Core Domain]

    Discovery[Discovery and Normalization]
    Intelligence[Eligibility, Fit, Quality, Decision]
    Background[Background Processing]
    Persistence[(Canonical Persistence)]

    ATS[External ATS Sources]
    AI[Optional AI Providers]

    Candidate -->|views and user intent| Dashboard
    Dashboard -->|application API calls| App
    App --> Core

    Core --> Discovery
    Core --> Intelligence
    Core --> Persistence

    Background -->|executes use cases| Core
    Discovery -->|server-side fetch| ATS
    Intelligence -.->|bounded, validated assistance| AI

    ATS -. untrusted source records .-> Discovery
    AI -. untrusted proposals .-> Intelligence
```

## Boundary notes

- The Web Dashboard renders data and captures intent; it does not own Eligibility or ranking rules.
- The Application/API and Background Worker use the same Core Domain behavior.
- Discovery retains source provenance and treats external content as untrusted.
- AI providers are optional capabilities behind a provider-neutral boundary. They do not own canonical state.
- Canonical Persistence retains history, provenance, uncertainty, and durable Application state.
