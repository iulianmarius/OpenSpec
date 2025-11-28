/**
 * Main verification engine for spec compliance checking.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { OPENSPEC_DIR_NAME } from '../config.js';
import { parseSpecFile, parseSpecDirectory } from './spec-parser.js';
import { verifyPoints, generateRecommendations } from './matcher.js';
import {
  VerificationPoint,
  VerificationResult,
  ComplianceReport,
  VerifyOptions,
} from './types.js';

export class Verifier {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Verify a specific change against its specs.
   */
  async verifyChange(changeId: string, options: VerifyOptions = {}): Promise<ComplianceReport[]> {
    const changePath = path.join(this.projectRoot, OPENSPEC_DIR_NAME, 'changes', changeId);
    const specsPath = path.join(changePath, 'specs');

    // Check if change exists
    try {
      await fs.access(changePath);
    } catch {
      throw new Error(`Change "${changeId}" not found`);
    }

    // Parse all specs in the change
    const specsByFile = await parseSpecDirectory(specsPath);
    const reports: ComplianceReport[] = [];

    for (const [specFile, points] of specsByFile) {
      const report = await this.verifySpecPoints(specFile, points, options);
      reports.push(report);
    }

    return reports;
  }

  /**
   * Verify all specs in the project.
   */
  async verifyAllSpecs(options: VerifyOptions = {}): Promise<ComplianceReport[]> {
    const specsPath = path.join(this.projectRoot, OPENSPEC_DIR_NAME, 'specs');
    const specsByFile = await parseSpecDirectory(specsPath);
    const reports: ComplianceReport[] = [];

    for (const [specFile, points] of specsByFile) {
      const report = await this.verifySpecPoints(specFile, points, options);
      reports.push(report);
    }

    return reports;
  }

  /**
   * Verify a single spec file.
   */
  async verifySpec(specId: string, options: VerifyOptions = {}): Promise<ComplianceReport> {
    const specPath = path.join(this.projectRoot, OPENSPEC_DIR_NAME, 'specs', specId, 'spec.md');

    try {
      await fs.access(specPath);
    } catch {
      throw new Error(`Spec "${specId}" not found`);
    }

    const points = await parseSpecFile(specPath);
    return this.verifySpecPoints(specPath, points, options);
  }

  /**
   * Internal method to verify a set of points.
   */
  private async verifySpecPoints(
    specFile: string,
    points: VerificationPoint[],
    options: VerifyOptions
  ): Promise<ComplianceReport> {
    // Run verification
    const results = await verifyPoints(points, this.projectRoot, {
      includeTests: options.includeTests ?? true,
      minConfidence: 30,
    });

    // Calculate summary
    const summary = {
      total: results.length,
      verified: results.filter(r => r.status === 'verified').length,
      partial: results.filter(r => r.status === 'partial').length,
      missing: results.filter(r => r.status === 'missing').length,
      unknown: results.filter(r => r.status === 'unknown').length,
      compliancePercentage: 0,
    };

    // Calculate compliance percentage
    // Verified = 100%, Partial = 50%, Missing/Unknown = 0%
    if (summary.total > 0) {
      const score = (summary.verified * 100 + summary.partial * 50) / summary.total;
      summary.compliancePercentage = Math.round(score);
    }

    // Generate recommendations
    const recommendations = generateRecommendations(results);

    // Get spec ID from path
    const specId = path.basename(path.dirname(specFile));

    return {
      specId,
      specFile,
      timestamp: new Date().toISOString(),
      results,
      summary,
      recommendations,
    };
  }
}

export * from './types.js';
export { parseSpecFile, parseSpecDirectory } from './spec-parser.js';
export { scanCodebase, groupEvidenceByFile } from './code-analyzer.js';
