# Obsidian Plugins

npm workspaces monorepo with independent Obsidian plugins.

- [Rule Based Daily Tasks](plugins/rule-based-daily-tasks/README.md)
- [Project Docs Bridge](plugins/project-docs-bridge/README.md)

## Development

```bash
npm ci
npm run build:tasks
npm run build:docs
npm run build
npm test
```

Project Docs Bridge unit tests use Node's built-in `node:test` runner after TypeScript compiles them to `.test-dist`.
