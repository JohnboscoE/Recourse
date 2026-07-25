# frontend/ — Job board + audit view (Week 2)

React + TypeScript + Vite + Tailwind. Deploys to Vercel. Not started until the
end-to-end loop works (see CLAUDE.md schedule).

## Scaffold when ready
```bash
pnpm create vite@latest frontend -- --template react-ts
# then add Tailwind, and depend on @recourse/shared (workspace:*)
```

The predicate type comes from `@recourse/shared` — the frontend WRITES predicates,
the agent executes against them, the resolver verifies. One source of truth.
