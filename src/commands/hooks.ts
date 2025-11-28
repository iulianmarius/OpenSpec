/**
 * hooks command implementation.
 * Manages drift prevention hooks for AI coding assistants.
 */

import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { promises as fs } from 'fs';

interface HookConfig {
  type: 'command';
  matcher: string;
  hooks: Array<{
    type: 'preToolUse';
    command: string;
  }>;
}

const DRIFT_GUARD_HOOK_NAME = 'openspec-drift-guard';

export function registerHooksCommand(program: Command): void {
  const hooksCmd = program
    .command('hooks')
    .description('Manage drift prevention hooks for AI assistants');

  hooksCmd
    .command('install')
    .description('Install drift prevention hooks for Claude Code')
    .option('--force', 'Overwrite existing hook files')
    .action(async (options: { force?: boolean }) => {
      try {
        const projectRoot = process.cwd();
        await installHooks(projectRoot, options.force);
        console.log(chalk.green('✓ Drift prevention hooks installed successfully'));
        console.log(chalk.gray('\nThe hook will check file scope before Edit/Write operations.'));
        console.log(chalk.gray('Create scope.md in your change directories to define boundaries.'));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  hooksCmd
    .command('uninstall')
    .description('Remove drift prevention hooks')
    .action(async () => {
      try {
        const projectRoot = process.cwd();
        await uninstallHooks(projectRoot);
        console.log(chalk.green('✓ Drift prevention hooks removed'));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  hooksCmd
    .command('status')
    .description('Check if drift prevention hooks are installed')
    .action(async () => {
      try {
        const projectRoot = process.cwd();
        const status = await getHookStatus(projectRoot);

        if (status.installed) {
          console.log(chalk.green('✓ Drift prevention hooks are installed'));
          console.log(chalk.gray(`  Hook script: ${status.hookScript}`));
          console.log(chalk.gray(`  Settings: ${status.settingsFile}`));
        } else {
          console.log(chalk.yellow('⚠ Drift prevention hooks are not installed'));
          console.log(chalk.gray('  Run "openspec hooks install" to set up hooks'));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  hooksCmd
    .command('docs')
    .description('Show documentation for hook configuration')
    .action(() => {
      console.log(chalk.bold('\n╔══════════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold('║                    DRIFT PREVENTION HOOKS                         ║'));
      console.log(chalk.bold('╠══════════════════════════════════════════════════════════════════╣'));
      console.log('║                                                                  ║');
      console.log('║  Drift prevention hooks intercept file Edit/Write operations    ║');
      console.log('║  and check if the target file is within the allowed scope.      ║');
      console.log('║                                                                  ║');
      console.log(chalk.bold('║  Setup                                                           ║'));
      console.log('║  1. Run: openspec hooks install                                 ║');
      console.log('║  2. Create scope.md in your change directory                    ║');
      console.log('║                                                                  ║');
      console.log(chalk.bold('║  scope.md Format                                                 ║'));
      console.log('║  ```markdown                                                     ║');
      console.log('║  ## In-Scope Files                                              ║');
      console.log('║  - src/auth/**/*.ts                                             ║');
      console.log('║  - test/auth/**/*.test.ts                                       ║');
      console.log('║                                                                  ║');
      console.log('║  ## Out-of-Scope Files                                          ║');
      console.log('║  - src/database/**/*                                            ║');
      console.log('║                                                                  ║');
      console.log('║  ## Requires Approval                                           ║');
      console.log('║  - package.json                                                 ║');
      console.log('║  ```                                                             ║');
      console.log('║                                                                  ║');
      console.log(chalk.bold('╚══════════════════════════════════════════════════════════════════╝'));
    });
}

async function installHooks(projectRoot: string, force?: boolean): Promise<void> {
  const claudeDir = path.join(projectRoot, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const hookScript = path.join(hooksDir, `${DRIFT_GUARD_HOOK_NAME}.sh`);

  // Create directories
  await fs.mkdir(hooksDir, { recursive: true });

  // Check if hook already exists
  try {
    await fs.access(hookScript);
    if (!force) {
      throw new Error('Hook script already exists. Use --force to overwrite.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // Write hook script
  const script = getDriftGuardScript();
  await fs.writeFile(hookScript, script, { mode: 0o755 });

  // Update settings.json
  let settings: { hooks?: HookConfig[] } = {};
  try {
    const existing = await fs.readFile(settingsFile, 'utf-8');
    settings = JSON.parse(existing);
  } catch {
    // No existing settings
  }

  // Add or update hook configuration
  settings.hooks = settings.hooks || [];

  const existingHookIndex = settings.hooks.findIndex(
    h => h.hooks?.some(hook => hook.command?.includes(DRIFT_GUARD_HOOK_NAME))
  );

  const hookConfig: HookConfig = {
    type: 'command',
    matcher: 'Edit|MultiEdit|Write',
    hooks: [{
      type: 'preToolUse',
      command: hookScript,
    }],
  };

  if (existingHookIndex >= 0) {
    settings.hooks[existingHookIndex] = hookConfig;
  } else {
    settings.hooks.push(hookConfig);
  }

  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
}

async function uninstallHooks(projectRoot: string): Promise<void> {
  const claudeDir = path.join(projectRoot, '.claude');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const hookScript = path.join(claudeDir, 'hooks', `${DRIFT_GUARD_HOOK_NAME}.sh`);

  // Remove hook script
  try {
    await fs.unlink(hookScript);
  } catch {
    // Script doesn't exist
  }

  // Update settings.json
  try {
    const existing = await fs.readFile(settingsFile, 'utf-8');
    const settings = JSON.parse(existing);

    if (settings.hooks) {
      settings.hooks = settings.hooks.filter(
        (h: HookConfig) => !h.hooks?.some(hook => hook.command?.includes(DRIFT_GUARD_HOOK_NAME))
      );

      if (settings.hooks.length === 0) {
        delete settings.hooks;
      }

      await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
    }
  } catch {
    // No settings file
  }
}

async function getHookStatus(projectRoot: string): Promise<{
  installed: boolean;
  hookScript?: string;
  settingsFile?: string;
}> {
  const claudeDir = path.join(projectRoot, '.claude');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const hookScript = path.join(claudeDir, 'hooks', `${DRIFT_GUARD_HOOK_NAME}.sh`);

  let scriptExists = false;
  let settingsConfigured = false;

  try {
    await fs.access(hookScript);
    scriptExists = true;
  } catch {
    // Script doesn't exist
  }

  try {
    const existing = await fs.readFile(settingsFile, 'utf-8');
    const settings = JSON.parse(existing);
    settingsConfigured = settings.hooks?.some(
      (h: HookConfig) => h.hooks?.some(hook => hook.command?.includes(DRIFT_GUARD_HOOK_NAME))
    );
  } catch {
    // No settings file
  }

  return {
    installed: scriptExists && settingsConfigured,
    hookScript: scriptExists ? hookScript : undefined,
    settingsFile: settingsConfigured ? settingsFile : undefined,
  };
}

function getDriftGuardScript(): string {
  return `#!/bin/bash
# OpenSpec Drift Guard Hook
# Checks if file modifications are within scope for active changes

# Read tool input from stdin
INPUT=$(cat)

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/' | head -1)

if [ -z "$FILE_PATH" ]; then
  # No file path found, allow operation
  echo '{"decision": "approve"}'
  exit 0
fi

# Run scope check
RESULT=$(openspec scope-check "$FILE_PATH" --json 2>/dev/null)

if [ $? -eq 0 ]; then
  STATUS=$(echo "$RESULT" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')

  case "$STATUS" in
    "in-scope")
      echo '{"decision": "approve"}'
      ;;
    "requires-approval")
      echo '{"decision": "block", "message": "This file requires approval to modify. It matches a requires-approval pattern in scope.md."}'
      ;;
    "out-of-scope")
      echo '{"decision": "block", "message": "This file is out of scope for the current change. Check scope.md for allowed files."}'
      ;;
    *)
      echo '{"decision": "approve"}'
      ;;
  esac
else
  # Scope check failed or not configured, allow operation
  echo '{"decision": "approve"}'
fi
`;
}

export { installHooks, uninstallHooks, getHookStatus };
