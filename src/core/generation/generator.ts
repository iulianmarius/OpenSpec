/**
 * Main spec generator orchestrating the generation process.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { OPENSPEC_DIR_NAME } from '../config.js';
import { scanDirectory, groupByCapability } from './code-scanner.js';
import { generateSpec, specToMarkdown } from './spec-generator.js';
import { GeneratedSpec, GenerateOptions } from './types.js';

export class Generator {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Generate specs for a specific directory.
   */
  async generateForDirectory(
    targetDir: string,
    options: GenerateOptions = {}
  ): Promise<GeneratedSpec[]> {
    const fullPath = path.isAbsolute(targetDir)
      ? targetDir
      : path.join(this.projectRoot, targetDir);

    // Scan the directory
    const { elements, tests } = await scanDirectory(fullPath, {
      includeTests: true,
    });

    if (elements.length === 0) {
      throw new Error(`No code elements found in ${targetDir}`);
    }

    // Group by capability
    const groups = groupByCapability(elements);
    const specs: GeneratedSpec[] = [];

    // Generate spec for each group
    for (const [capabilityId, groupElements] of groups) {
      // Find related tests
      const relatedTests = tests.filter(t =>
        t.file.includes(capabilityId) ||
        t.parentDescribe?.toLowerCase().includes(capabilityId.toLowerCase())
      );

      const spec = generateSpec(capabilityId, groupElements, relatedTests);
      specs.push(spec);
    }

    return specs;
  }

  /**
   * Generate specs from test files only.
   */
  async generateFromTests(
    testDir: string,
    options: GenerateOptions = {}
  ): Promise<GeneratedSpec[]> {
    const fullPath = path.isAbsolute(testDir)
      ? testDir
      : path.join(this.projectRoot, testDir);

    // Scan tests only
    const { tests } = await scanDirectory(fullPath, { includeTests: true });

    if (tests.length === 0) {
      throw new Error(`No test files found in ${testDir}`);
    }

    // Group tests by describe block
    const groups = new Map<string, typeof tests>();
    for (const test of tests) {
      const group = test.parentDescribe || path.basename(test.file, '.test.ts');
      const existing = groups.get(group) || [];
      existing.push(test);
      groups.set(group, existing);
    }

    // Generate spec for each group
    const specs: GeneratedSpec[] = [];
    for (const [groupName, groupTests] of groups) {
      const spec = generateSpec(groupName, [], groupTests);
      specs.push(spec);
    }

    return specs;
  }

  /**
   * Write generated specs to the openspec directory.
   */
  async writeSpecs(specs: GeneratedSpec[], options: GenerateOptions = {}): Promise<string[]> {
    const writtenPaths: string[] = [];
    const outputBase = options.output ||
      path.join(this.projectRoot, OPENSPEC_DIR_NAME, 'specs');

    for (const spec of specs) {
      const specDir = path.join(outputBase, spec.capabilityId);
      const specPath = path.join(specDir, 'spec.md');

      if (options.dryRun) {
        writtenPaths.push(specPath);
        continue;
      }

      // Create directory
      await fs.mkdir(specDir, { recursive: true });

      // Write spec file
      const markdown = specToMarkdown(spec);
      await fs.writeFile(specPath, markdown, 'utf-8');

      writtenPaths.push(specPath);
    }

    return writtenPaths;
  }
}

export * from './types.js';
export { scanDirectory, groupByCapability } from './code-scanner.js';
export { generateSpec, specToMarkdown } from './spec-generator.js';
