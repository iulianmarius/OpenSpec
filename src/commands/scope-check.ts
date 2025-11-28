/**
 * scope-check command implementation.
 * Checks if a file is within the allowed scope for a change.
 */

import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { OPENSPEC_DIR_NAME } from '../core/config.js';

interface ScopeDefinition {
  inScope: string[];
  outOfScope: string[];
  requiresApproval: string[];
}

interface ScopeCheckResult {
  status: 'in-scope' | 'out-of-scope' | 'requires-approval';
  file: string;
  changeId?: string;
  matchedPattern?: string;
}

export function registerScopeCheckCommand(program: Command): void {
  program
    .command('scope-check <file>')
    .description('Check if a file is within the allowed scope for changes')
    .option('--change <id>', 'Specify the change to check against')
    .option('--json', 'Output result as JSON')
    .option('--log-drift', 'Log approved drift to drift-log.md')
    .option('--reason <text>', 'Reason for the drift (used with --log-drift)')
    .option('--impact <text>', 'Impact description (used with --log-drift)')
    .action(async (file: string, options: { change?: string; json?: boolean; logDrift?: boolean; reason?: string; impact?: string }) => {
      try {
        const projectRoot = process.cwd();
        const result = await checkFileScope(projectRoot, file, options.change);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printScopeResult(result);
        }

        // Exit codes: 0 = in-scope, 1 = requires-approval, 2 = out-of-scope
        if (result.status === 'out-of-scope') {
          process.exit(2);
        } else if (result.status === 'requires-approval') {
          if (options.logDrift && options.reason) {
            await logDrift(projectRoot, file, options.reason, options.impact, result.changeId);
            console.log(chalk.yellow('Drift logged to drift-log.md'));
          }
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
}

async function checkFileScope(projectRoot: string, file: string, changeId?: string): Promise<ScopeCheckResult> {
  // Find active changes with scope files
  const changesDir = path.join(projectRoot, OPENSPEC_DIR_NAME, 'changes');

  let changesToCheck: string[] = [];

  if (changeId) {
    changesToCheck = [changeId];
  } else {
    // Find all active changes
    try {
      const entries = await fs.readdir(changesDir, { withFileTypes: true });
      changesToCheck = entries
        .filter(e => e.isDirectory() && e.name !== 'archive')
        .map(e => e.name);
    } catch {
      // No changes directory
      return { status: 'in-scope', file };
    }
  }

  // Check each change for scope definition
  for (const change of changesToCheck) {
    const scopePath = path.join(changesDir, change, 'scope.md');

    try {
      await fs.access(scopePath);
      const scopeContent = await fs.readFile(scopePath, 'utf-8');
      const scope = parseScopeFile(scopeContent);

      // Check out-of-scope first (highest priority)
      for (const pattern of scope.outOfScope) {
        if (matchGlob(file, pattern)) {
          return {
            status: 'out-of-scope',
            file,
            changeId: change,
            matchedPattern: pattern,
          };
        }
      }

      // Check requires-approval
      for (const pattern of scope.requiresApproval) {
        if (matchGlob(file, pattern)) {
          return {
            status: 'requires-approval',
            file,
            changeId: change,
            matchedPattern: pattern,
          };
        }
      }

      // Check in-scope
      for (const pattern of scope.inScope) {
        if (matchGlob(file, pattern)) {
          return {
            status: 'in-scope',
            file,
            changeId: change,
            matchedPattern: pattern,
          };
        }
      }
    } catch {
      // No scope file for this change, skip
      continue;
    }
  }

  // No scope restrictions found, default to in-scope
  return { status: 'in-scope', file };
}

function parseScopeFile(content: string): ScopeDefinition {
  const scope: ScopeDefinition = {
    inScope: [],
    outOfScope: [],
    requiresApproval: [],
  };

  let currentSection: keyof ScopeDefinition | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Check for section headers
    if (/^#+\s*in[- ]?scope/i.test(trimmed)) {
      currentSection = 'inScope';
    } else if (/^#+\s*out[- ]?of[- ]?scope/i.test(trimmed)) {
      currentSection = 'outOfScope';
    } else if (/^#+\s*requires[- ]?approval/i.test(trimmed)) {
      currentSection = 'requiresApproval';
    } else if (currentSection && trimmed.startsWith('-')) {
      // Parse list item as glob pattern
      const pattern = trimmed.slice(1).trim();
      if (pattern) {
        scope[currentSection].push(pattern);
      }
    }
  }

  return scope;
}

function matchGlob(file: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // Use placeholders to avoid replacing regex special chars within our replacements
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '\x00GLOBSTAR_SLASH\x00')  // Placeholder for **/
    .replace(/\*\*/g, '\x00GLOBSTAR\x00')          // Placeholder for **
    .replace(/\*/g, '[^/]*')                        // * = match within single directory
    .replace(/\?/g, '.')
    .replace(/\x00GLOBSTAR_SLASH\x00/g, '(?:.+/)?') // **/ = one or more directories (optional)
    .replace(/\x00GLOBSTAR\x00/g, '.*');            // ** alone = match anything

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(file) || regex.test(file.replace(/^\.\//, ''));
}

function printScopeResult(result: ScopeCheckResult): void {
  const icon = result.status === 'in-scope' ? chalk.green('✓') :
               result.status === 'requires-approval' ? chalk.yellow('⚠') :
               chalk.red('✗');

  const status = result.status === 'in-scope' ? chalk.green('IN SCOPE') :
                 result.status === 'requires-approval' ? chalk.yellow('REQUIRES APPROVAL') :
                 chalk.red('OUT OF SCOPE');

  console.log(`${icon} ${result.file}: ${status}`);

  if (result.matchedPattern) {
    console.log(chalk.gray(`  Matched pattern: ${result.matchedPattern}`));
  }
  if (result.changeId) {
    console.log(chalk.gray(`  Change: ${result.changeId}`));
  }
}

async function logDrift(projectRoot: string, file: string, reason: string, impact?: string, changeId?: string): Promise<void> {
  const driftLogPath = changeId
    ? path.join(projectRoot, OPENSPEC_DIR_NAME, 'changes', changeId, 'drift-log.md')
    : path.join(projectRoot, OPENSPEC_DIR_NAME, 'drift-log.md');

  const timestamp = new Date().toISOString();
  const entry = `
## ${timestamp}

- **File**: ${file}
- **Reason**: ${reason}
${impact ? `- **Impact**: ${impact}` : ''}
- **Status**: Approved

---
`;

  try {
    const existing = await fs.readFile(driftLogPath, 'utf-8').catch(() => '# Drift Log\n\nApproved deviations from scope.\n');
    await fs.writeFile(driftLogPath, existing + entry);
  } catch (error) {
    throw new Error(`Failed to write drift log: ${(error as Error).message}`);
  }
}

export { checkFileScope, parseScopeFile, matchGlob, ScopeDefinition, ScopeCheckResult };
