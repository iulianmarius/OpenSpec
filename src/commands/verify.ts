/**
 * verify command implementation.
 * Checks if code implementation matches spec requirements.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Verifier, ComplianceReport, VerificationResult } from '../core/verification/verifier.js';

interface VerifyCommandOptions {
  all?: boolean;
  json?: boolean;
  verbose?: boolean;
  minCompliance?: string;
  includeTests?: boolean;
}

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify [item]')
    .description('Verify code compliance with specs')
    .option('--all', 'Verify all specs in the project')
    .option('--json', 'Output results as JSON')
    .option('--verbose', 'Show detailed evidence for each verification point')
    .option('--min-compliance <percentage>', 'Fail if compliance below threshold (0-100)')
    .option('--include-tests', 'Include test files in analysis (default: true)')
    .action(async (item: string | undefined, options: VerifyCommandOptions) => {
      const spinner = ora();

      try {
        const projectRoot = process.cwd();
        const verifier = new Verifier(projectRoot);
        let reports: ComplianceReport[];

        if (options.all) {
          spinner.start('Verifying all specs against codebase...');
          reports = await verifier.verifyAllSpecs({
            includeTests: options.includeTests ?? true,
            verbose: options.verbose,
          });
          spinner.stop();
        } else if (item) {
          // Determine if it's a change or spec
          spinner.start(`Verifying ${item}...`);

          try {
            // Try as change first
            reports = await verifier.verifyChange(item, {
              includeTests: options.includeTests ?? true,
              verbose: options.verbose,
            });
          } catch {
            // Try as spec
            const report = await verifier.verifySpec(item, {
              includeTests: options.includeTests ?? true,
              verbose: options.verbose,
            });
            reports = [report];
          }
          spinner.stop();
        } else {
          console.log(chalk.yellow('Usage: openspec verify <change-id|spec-id> or openspec verify --all'));
          process.exit(1);
          return;
        }

        if (reports.length === 0) {
          console.log(chalk.yellow('No specs found to verify.'));
          return;
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(reports, null, 2));
        } else {
          for (const report of reports) {
            printReport(report, options.verbose ?? false);
          }

          // Print overall summary
          if (reports.length > 1) {
            printOverallSummary(reports);
          }
        }

        // Check minimum compliance
        if (options.minCompliance) {
          const minCompliance = parseInt(options.minCompliance, 10);
          const overallCompliance = calculateOverallCompliance(reports);

          if (overallCompliance < minCompliance) {
            console.log(chalk.red(`\n✗ Compliance ${overallCompliance}% is below minimum ${minCompliance}%`));
            process.exit(1);
          }
        }

      } catch (error) {
        spinner.stop();
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
}

function printReport(report: ComplianceReport, verbose: boolean): void {
  const { summary } = report;

  console.log(chalk.bold(`\n╔══════════════════════════════════════════════════════════════════╗`));
  console.log(chalk.bold(`║  SPEC COMPLIANCE REPORT: ${report.specId.padEnd(38)}║`));
  console.log(chalk.bold(`╠══════════════════════════════════════════════════════════════════╣`));

  // Summary bar
  const complianceColor = summary.compliancePercentage >= 70
    ? chalk.green
    : summary.compliancePercentage >= 40
      ? chalk.yellow
      : chalk.red;

  console.log(`║  Compliance: ${complianceColor(summary.compliancePercentage + '%').padEnd(52)}║`);
  console.log(`║  ${chalk.gray(`File: ${report.specFile}`.slice(0, 62).padEnd(62))}║`);
  console.log(`╠══════════════════════════════════════════════════════════════════╣`);

  // Stats
  console.log(`║  ${chalk.green('✓ Verified:')} ${String(summary.verified).padEnd(4)} ${chalk.yellow('⚠ Partial:')} ${String(summary.partial).padEnd(4)} ${chalk.red('✗ Missing:')} ${String(summary.missing).padEnd(4)} ${chalk.gray('? Unknown:')} ${String(summary.unknown).padEnd(2)}║`);
  console.log(`╠══════════════════════════════════════════════════════════════════╣`);

  // Results
  for (const result of report.results) {
    const statusIcon = getStatusIcon(result.status);
    const statusColor = getStatusColor(result.status);
    const name = result.point.name.slice(0, 50).padEnd(50);

    console.log(`║  ${statusIcon} ${statusColor(name)} ${chalk.gray(`(${result.confidence}%)`).padStart(6)}║`);

    if (verbose && result.evidence.length > 0) {
      for (const e of result.evidence.slice(0, 3)) {
        const file = `    ${e.file}:${e.line}`.slice(0, 60);
        console.log(`║  ${chalk.gray(file.padEnd(62))}║`);
      }
    }

    if (verbose && result.notes.length > 0) {
      for (const note of result.notes) {
        console.log(`║  ${chalk.gray(`    → ${note}`.slice(0, 62).padEnd(62))}║`);
      }
    }
  }

  console.log(`╠══════════════════════════════════════════════════════════════════╣`);

  // Recommendations
  console.log(`║  ${chalk.bold('Recommendations:').padEnd(62)}║`);
  for (const rec of report.recommendations) {
    const lines = wrapText(rec, 60);
    for (const line of lines) {
      console.log(`║  ${chalk.gray(`• ${line}`.padEnd(62))}║`);
    }
  }

  console.log(chalk.bold(`╚══════════════════════════════════════════════════════════════════╝`));
}

function printOverallSummary(reports: ComplianceReport[]): void {
  const overallCompliance = calculateOverallCompliance(reports);
  const totalVerified = reports.reduce((sum, r) => sum + r.summary.verified, 0);
  const totalPartial = reports.reduce((sum, r) => sum + r.summary.partial, 0);
  const totalMissing = reports.reduce((sum, r) => sum + r.summary.missing, 0);
  const totalPoints = reports.reduce((sum, r) => sum + r.summary.total, 0);

  console.log(chalk.bold(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(chalk.bold(`  OVERALL SUMMARY`));
  console.log(chalk.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(`  Specs analyzed: ${reports.length}`);
  console.log(`  Total verification points: ${totalPoints}`);
  console.log(`  ${chalk.green('✓ Verified:')} ${totalVerified}  ${chalk.yellow('⚠ Partial:')} ${totalPartial}  ${chalk.red('✗ Missing:')} ${totalMissing}`);

  const complianceColor = overallCompliance >= 70 ? chalk.green : overallCompliance >= 40 ? chalk.yellow : chalk.red;
  console.log(`  Overall Compliance: ${complianceColor(overallCompliance + '%')}`);
  console.log(chalk.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));
}

function calculateOverallCompliance(reports: ComplianceReport[]): number {
  if (reports.length === 0) return 0;
  const totalScore = reports.reduce((sum, r) => sum + r.summary.compliancePercentage, 0);
  return Math.round(totalScore / reports.length);
}

function getStatusIcon(status: VerificationResult['status']): string {
  switch (status) {
    case 'verified': return chalk.green('✓');
    case 'partial': return chalk.yellow('⚠');
    case 'missing': return chalk.red('✗');
    case 'unknown': return chalk.gray('?');
  }
}

function getStatusColor(status: VerificationResult['status']): (text: string) => string {
  switch (status) {
    case 'verified': return chalk.green;
    case 'partial': return chalk.yellow;
    case 'missing': return chalk.red;
    case 'unknown': return chalk.gray;
  }
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}
