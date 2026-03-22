# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ontology Studio — a graph editing studio where domain experts can build ontologies without code/queries. Users dump knowledge in free-form text, LLM structures it into classes/properties/instances/relations, and the user reviews and approves.

Architecture follows an "Ontology Git" pattern:
- **Layer 1 (Frontend)**: Next.js + React Flow + shadcn/ui — user interaction + LLM assistance
- **Layer 2 (Staging)**: Supabase — commit log, change history, rollback points, ontology CRUD
- **Layer 3 (Production)**: Neo4j — finalized ontology graph with vector index + Cypher

The app code lives in the `ontology/` subdirectory. The PRD lives in `docs/PRD-MVP.md`.

## Commands

All commands run from the `ontology/` directory. Package manager is **npm**.

```bash
npm run dev      # Start dev server (uses Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

Dev server runs at http://localhost:3000.

## Architecture & Conventions

### Mandatory Rules

- **Always use `'use client'` directive** on all components (client components only).
- **Page params must use Promise** — `page.tsx` params props are async (Next.js 15 pattern).
- Use `picsum.photos` for placeholder images.

### Directory Structure (feature-sliced)

```
ontology/src/
├── app/              # Next.js App Router pages
├── components/ui/    # shadcn/ui components
├── constants/        # Shared constants
├── hooks/            # Shared hooks
├── lib/              # Utility functions
├── remote/           # HTTP client
└── features/
    └── [featureName]/
        ├── components/   # Feature-specific components
        ├── constants/
        ├── hooks/
        ├── lib/
        └── api.ts        # API fetch functions
```

### Providers (src/app/providers.tsx)

Root wraps all pages with:
- `ThemeProvider` (next-themes) — system/light/dark theme support
- `QueryClientProvider` (@tanstack/react-query) — default staleTime: 60s

### Library Usage

| Need | Use |
|------|-----|
| Date/time | `date-fns` |
| Branching logic | `ts-pattern` |
| Server state | `@tanstack/react-query` |
| Global state | `zustand` |
| React hooks | `react-use` |
| Utilities | `es-toolkit` |
| Icons | `lucide-react` |
| Validation | `zod` |
| UI components | shadcn/ui (`npx shadcn@latest add <component>`) |
| Styling | Tailwind CSS |
| Backend | Supabase (do NOT run locally) |
| Forms | `react-hook-form` + `@hookform/resolvers` |

### shadcn/ui

Add new components via CLI: `npx shadcn@latest add <component>`. Path aliases configured in `components.json` use `@/` prefix.

### Supabase

- Do not run Supabase locally.
- Store migration SQL files in `/supabase/migrations/`.
- When adding tables, create migration files rather than running commands directly.

### Code Style

- Early returns; prefer conditional classes over ternary
- Functional & immutable; avoid mutation
- Composition over inheritance
- Minimize AI-generated comments; use descriptive names instead
- Document "why" not "what"
- Prefer returning errors over throwing exceptions
- Korean text in UI must be valid UTF-8

### Tech Stack Versions

- Next.js 15.1 (App Router) with Turbopack
- React 19
- TypeScript 5
- Tailwind CSS 3.4
