# AI OS Agent Instructions

## Purpose

This repository is the control plane for a personal, multi-provider AI ecosystem. It must allow Codex, OpenCodex, ChatGPT, Claude Code, Gemini CLI, Ollama, n8n, and future tools to share project knowledge without vendor lock-in.

## Mandatory principles

1. Git and reviewed Markdown are the source of truth.
2. Do not use chat history or a memory database as authoritative documentation.
3. Archive complete sessions separately from durable memory.
4. Store only compact, durable facts in shared memory.
5. Keep provider-specific behavior behind adapters.
6. Prefer local-first components and portable open formats.
7. Never commit credentials, tokens, private keys, personal attachments, or raw sensitive data.
8. Do not select a framework or database until an ADR documents the decision.
9. Do not implement production modules before Phase 0 acceptance criteria are complete.

## Before changing the repository

Read, in order:

1. `README.md`
2. `docs/architecture.md`
3. `docs/roadmap.md`
4. relevant files under `docs/decisions/`
5. relevant project entry under `projects/`

## Work protocol

For every task:

1. Inspect existing files and constraints.
2. State the intended change and affected boundaries.
3. Make the smallest coherent change.
4. Update architecture documentation when a boundary or data contract changes.
5. Create an ADR for consequential, hard-to-reverse decisions.
6. Run applicable validation and tests.
7. Report changed files, decisions, risks, and unfinished work.

## Language

- Source code, schemas, commit messages, and technical documentation: English.
- Explanations to the repository owner: Vietnamese unless requested otherwise.

## Current phase constraint

The project is in Phase 0. Focus on architecture, contracts, schemas, privacy boundaries, and implementation planning. Avoid premature application code.
