# OpenSpec - Claude Code Guide

OpenSpec is a spec-driven development tool for AI coding assistants. It helps humans and AI agree on what to build before any code is written. The CLI creates and manages specification files, change proposals, and workflow integrations for various AI tools.

## Quick Reference

```bash
# Development
pnpm install          # Install dependencies
pnpm run build        # Build TypeScript to dist/
pnpm run dev          # Watch mode for TypeScript compilation
pnpm run dev:cli      # Build and run CLI locally

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage

# CLI Testing (after build)
node bin/openspec.js --version
node bin/openspec.js init --help
```

## Project Structure

```
OpenSpec/
├── src/                    # TypeScript source code
│   ├── cli/               # CLI entry point (Commander.js)
│   │   └── index.ts       # Main CLI with all commands
│   ├── commands/          # Command implementations
│   │   ├── change.ts      # Change command (deprecated, forwards to new commands)
│   │   ├── show.ts        # Show command implementation
│   │   ├── spec.ts        # Spec command implementation
│   │   └── validate.ts    # Validate command implementation
│   ├── core/              # Core business logic
│   │   ├── init.ts        # Init command (creates openspec/ structure)
│   │   ├── update.ts      # Update command (refreshes AI tool files)
│   │   ├── archive.ts     # Archive command (moves completed changes)
│   │   ├── list.ts        # List command (shows changes/specs)
│   │   ├── view.ts        # View command (interactive dashboard)
│   │   ├── config.ts      # AI_TOOLS registry configuration
│   │   ├── configurators/ # AI tool configurators
│   │   │   ├── slash/     # Slash command generators per tool
│   │   │   └── registry.ts # Tool configurator registry
│   │   ├── parsers/       # Markdown/spec parsers
│   │   ├── schemas/       # Zod schemas for validation
│   │   ├── templates/     # Template generators
│   │   ├── validation/    # Validation logic
│   │   └── styles/        # Console output styling
│   ├── utils/             # Shared utilities
│   │   ├── file-system.ts # File operations with rollback
│   │   ├── item-discovery.ts # Find specs/changes
│   │   └── match.ts       # Name matching utilities
│   └── index.ts           # Library exports
├── test/                   # Test files
│   ├── cli-e2e/           # End-to-end CLI tests
│   ├── commands/          # Command unit tests
│   ├── core/              # Core logic tests
│   ├── fixtures/          # Test fixtures
│   ├── helpers/           # Test utilities (runCLI)
│   └── utils/             # Utility tests
├── bin/
│   └── openspec.js        # CLI entry point (imports dist/cli/index.js)
├── openspec/              # OpenSpec's own specs (dogfooding)
│   ├── AGENTS.md          # AI instructions for this project
│   ├── project.md         # Project conventions
│   ├── specs/             # Current specifications
│   └── changes/           # Active and archived changes
├── dist/                   # Compiled output (gitignored)
├── build.js               # Build script (runs tsc)
├── tsconfig.json          # TypeScript config (ES2022, NodeNext)
├── vitest.config.ts       # Test configuration
└── package.json           # pnpm package manifest
```

## Key Files to Understand

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI entry point with all command definitions |
| `src/core/config.ts` | `AI_TOOLS` registry listing all supported tools |
| `src/core/init.ts` | Creates openspec/ structure and configures AI tools |
| `src/core/archive.ts` | Archives completed changes, applies deltas to specs |
| `src/core/configurators/registry.ts` | Tool configurator registry |
| `src/core/templates/slash-command-templates.ts` | Shared slash command templates |
| `openspec/AGENTS.md` | Complete workflow instructions for AI assistants |
| `openspec/specs/openspec-conventions/spec.md` | OpenSpec's own conventions spec |

## Technology Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js ≥20.19.0 (ESM modules)
- **Package Manager**: pnpm
- **CLI Framework**: Commander.js
- **Interactive Prompts**: @inquirer/prompts
- **Validation**: Zod
- **Testing**: Vitest
- **Terminal UI**: chalk, ora

## Development Workflow

### 1. Making Changes

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build

# Test your changes locally
node bin/openspec.js <command>

# Or use dev mode for auto-rebuild
pnpm run dev          # In one terminal
node bin/openspec.js  # In another terminal after changes
```

### 2. Running Tests

```bash
pnpm test                     # Run all tests
pnpm test -- --watch          # Watch mode
pnpm test -- test/core/       # Run specific directory
pnpm test -- -t "should"      # Run tests matching pattern
```

### 3. Code Conventions

- **Async/await** for all async operations
- **Error handling**: Let errors bubble up to CLI level for consistent messaging
- **Exit codes**: 0 (success), 1 (error), 2 (misuse)
- **No excessive logging**: Use console.log for output, console.error for errors
- **Minimal dependencies**: Prefer native Node.js APIs
- **Descriptive names**: Code should be self-documenting

### 4. Adding a New AI Tool Integration

1. Add tool entry to `src/core/config.ts` in `AI_TOOLS` array
2. Create configurator in `src/core/configurators/<tool>.ts`
3. Create slash command generator in `src/core/configurators/slash/<tool>.ts`
4. Register in `src/core/configurators/registry.ts` and `src/core/configurators/slash/registry.ts`
5. Add tests in `test/core/init.test.ts`
6. Update README.md with the new tool

### 5. CLI Commands

Main commands (verb-first pattern):
- `openspec init [path]` - Initialize OpenSpec in a project
- `openspec update [path]` - Refresh AI tool instruction files
- `openspec list` - List active changes (add `--specs` for specs)
- `openspec show [item]` - Display change or spec details
- `openspec validate [item]` - Validate specs/changes
- `openspec archive <change>` - Archive completed change
- `openspec view` - Interactive dashboard

Deprecated noun-based commands (still supported):
- `openspec change show|list|validate` (use verb-first instead)
- `openspec spec show|list|validate` (use verb-first instead)

## Testing Patterns

### Unit Tests
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

describe('FeatureName', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should do expected behavior', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### E2E CLI Tests
```typescript
import { runCLI } from '../helpers/run-cli.js';

it('should show help', async () => {
  const result = await runCLI(['--help']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('openspec');
});
```

## Git & Release Process

### Commit Messages
Follow Conventional Commits:
```
type(scope): subject

# Examples:
feat(init): add support for new AI tool
fix(archive): handle missing spec files
docs(readme): update installation instructions
chore(deps): bump commander to v14
```

### Changesets
For any user-facing changes:
```bash
pnpm changeset
# Follow prompts to describe the change
# Creates a file in .changeset/
```

### CI Pipeline
- **PR checks**: Build, test, type-check, changeset validation
- **Main branch**: Full test matrix (Linux, macOS, Windows)
- **Release**: Changesets handle versioning and CHANGELOG

## Common Tasks

### Adding a New Command

1. Create command in `src/commands/<name>.ts`:
```typescript
import { Command } from 'commander';

export function register<Name>Command(program: Command): void {
  program
    .command('<name>')
    .description('...')
    .option('--flag', 'description')
    .action(async (options) => {
      // Implementation
    });
}
```

2. Register in `src/cli/index.ts`:
```typescript
import { register<Name>Command } from '../commands/<name>.js';
register<Name>Command(program);
```

3. Add tests in `test/commands/<name>.test.ts`

### Modifying Spec Validation

Validation logic lives in:
- `src/core/validation/validator.ts` - Main validation logic
- `src/core/schemas/` - Zod schemas for structure validation
- `src/core/parsers/` - Markdown parsing

### Debugging

```bash
# Verbose output for specific command
DEBUG=openspec:* node bin/openspec.js <command>

# Test specific file
pnpm test -- test/core/archive.test.ts

# Check types without building
pnpm exec tsc --noEmit
```

## OpenSpec Conventions (for this repo)

This repository uses OpenSpec for its own development. See:
- `openspec/AGENTS.md` - Full workflow instructions
- `openspec/project.md` - Project-specific conventions
- `openspec/specs/` - Current specifications
- `openspec/changes/` - Active change proposals

When making significant changes:
1. Check `openspec list` for active changes
2. Create a change proposal if needed (new features, breaking changes)
3. Follow the spec-driven workflow

## Important Notes

- **Node.js version**: Requires ≥20.19.0 (check with `node --version`)
- **Package manager**: Use pnpm exclusively (`npm` and `yarn` not tested)
- **Build before test**: Tests may require compiled `dist/` directory
- **ESM modules**: All imports use `.js` extension (even for `.ts` files)
- **Cross-platform**: Code must work on Linux, macOS, and Windows

## Links

- [Repository](https://github.com/Fission-AI/OpenSpec)
- [npm Package](https://www.npmjs.com/package/@fission-ai/openspec)
- [AGENTS.md Convention](https://agents.md/)
