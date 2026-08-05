# ADR-0001: Core Runtime

- Status: Proposed
- Date: 2026-08-05

## Context

AI OS needs one primary runtime for the MCP server, provider adapters, session ingestion, schema validation, automation, CLI tooling, and the first dashboard API. The system must remain provider-independent and must not prevent Python or other language adapters later.

## Decision

Use TypeScript on the current active Node.js LTS line as the primary application runtime.

Use a monorepo structure with independently deployable applications and reusable packages. Runtime boundaries must communicate through documented contracts rather than importing provider-specific implementation details.

Python may be used in isolated workers when a library has no practical TypeScript equivalent, especially for document processing or machine-learning workloads. Such workers must expose a stable interface and remain optional.

## Consequences

- One package ecosystem can cover the API, CLI, MCP server, adapters, and dashboard.
- Shared types can be reused, but every external input still requires runtime validation.
- CPU-heavy or Python-specific workloads must run behind a worker or adapter boundary.
- Provider SDK types must never become domain contracts.

## Alternatives considered

- Python as the primary runtime.
- Go as the primary runtime.
- Multiple equal runtimes from day one.
