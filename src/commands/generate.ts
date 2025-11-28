/**
 * generate command implementation.
 * Auto-generates specs from existing code.
 */

import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { Generator, GeneratedSpec, specToMarkdown } from '../core/generation/generator.js';

interface GenerateCommandOptions {
  fromTests?: boolean;
  output?: string;
  dryRun?: boolean;
  json?: boolean;
  interactive?: boolean;
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate <path>')
    .description('Generate specs from existing code')
    .option('--from-tests', 'Generate specs from test files only')
    .option('--output <dir>', 'Output directory for generated specs')
    .option('--dry-run', 'Preview without writing files')
    .option('--json', 'Output generated specs as JSON')
    .option('--interactive', 'Interactively review and refine generated specs')
    .action(async (targetPath: string, options: GenerateCommandOptions) => {
      const spinner = ora();

      try {
        const projectRoot = process.cwd();
        const generator = new Generator(projectRoot);

        spinner.start(`Analyzing ${targetPath}...`);

        let specs: GeneratedSpec[];

        if (options.fromTests) {
          specs = await generator.generateFromTests(targetPath, options);
        } else {
          specs = await generator.generateForDirectory(targetPath, options);
        }

        spinner.stop();

        if (specs.length === 0) {
          console.log(chalk.yellow('No specs could be generated from the provided path.'));
          return;
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(specs, null, 2));
          return;
        }

        // Print summary
        console.log(chalk.bold('\n╔══════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold('║                    SPEC GENERATION REPORT                        ║'));
        console.log(chalk.bold('╠══════════════════════════════════════════════════════════════════╣'));

        for (const spec of specs) {
          const confidenceColor = spec.confidence === 'high' ? chalk.green :
            spec.confidence === 'medium' ? chalk.yellow : chalk.red;

          console.log(`║  ${chalk.cyan(spec.capabilityId.padEnd(30))} ${confidenceColor(`[${spec.confidence}]`.padEnd(10))} ${chalk.gray(`${spec.requirements.length} req(s)`).padStart(20)} ║`);

          for (const req of spec.requirements.slice(0, 3)) {
            console.log(`║    ${chalk.gray('•')} ${req.name.slice(0, 50).padEnd(55)} ║`);
          }
          if (spec.requirements.length > 3) {
            console.log(`║    ${chalk.gray(`... and ${spec.requirements.length - 3} more`).padEnd(57)} ║`);
          }
        }

        console.log(chalk.bold('╠══════════════════════════════════════════════════════════════════╣'));

        // Stats
        const totalReqs = specs.reduce((sum, s) => sum + s.requirements.length, 0);
        const highConf = specs.filter(s => s.confidence === 'high').length;
        const medConf = specs.filter(s => s.confidence === 'medium').length;

        console.log(`║  ${chalk.bold('Generated:')} ${specs.length} spec(s), ${totalReqs} requirement(s)`.padEnd(65) + '║');
        console.log(`║  ${chalk.bold('Confidence:')} ${chalk.green(highConf + ' high')}, ${chalk.yellow(medConf + ' medium')}, ${chalk.red((specs.length - highConf - medConf) + ' low')}`.padEnd(76) + '║');
        console.log(chalk.bold('╚══════════════════════════════════════════════════════════════════╝'));

        // Write or preview
        if (options.dryRun) {
          console.log(chalk.yellow('\n📝 Dry run - no files written.'));
          console.log(chalk.gray('Files that would be created:\n'));

          for (const spec of specs) {
            const outputDir = options.output || 'openspec/specs';
            console.log(chalk.gray(`  ${outputDir}/${spec.capabilityId}/spec.md`));
          }

          console.log(chalk.gray('\nPreview of first spec:\n'));
          console.log(chalk.gray('─'.repeat(66)));
          const preview = specToMarkdown(specs[0]).split('\n').slice(0, 30).join('\n');
          console.log(chalk.gray(preview));
          if (specToMarkdown(specs[0]).split('\n').length > 30) {
            console.log(chalk.gray('... (truncated)'));
          }
          console.log(chalk.gray('─'.repeat(66)));
        } else {
          spinner.start('Writing spec files...');
          const writtenPaths = await generator.writeSpecs(specs, options);
          spinner.succeed(`Created ${writtenPaths.length} spec file(s)`);

          console.log(chalk.green('\n✓ Specs generated successfully!\n'));
          console.log(chalk.white('Created files:'));
          for (const p of writtenPaths) {
            console.log(chalk.gray(`  ${p}`));
          }

          console.log(chalk.yellow('\n⚠️  Next steps:'));
          console.log(chalk.gray('  1. Review the generated specs for accuracy'));
          console.log(chalk.gray('  2. Add business context to "Purpose" sections'));
          console.log(chalk.gray('  3. Remove implementation details'));
          console.log(chalk.gray('  4. Run `openspec validate --specs` to check format'));
        }

      } catch (error) {
        spinner.stop();
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
}
