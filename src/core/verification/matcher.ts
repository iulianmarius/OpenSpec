/**
 * Matches verification points from specs with code evidence.
 */

import { VerificationPoint, CodeEvidence, VerificationResult } from './types.js';
import { scanCodebase, scoreEvidence } from './code-analyzer.js';

interface MatchOptions {
  includeTests?: boolean;
  minConfidence?: number;
}

/**
 * Match a single verification point against code evidence.
 */
function matchPoint(
  point: VerificationPoint,
  allEvidence: CodeEvidence[],
  options: MatchOptions = {}
): VerificationResult {
  const minConfidence = options.minConfidence ?? 30;

  // Filter evidence relevant to this point
  const relevantEvidence = allEvidence.filter(e => {
    const matchCount = point.keywords.filter(kw =>
      e.matchedKeywords.some(ek => ek.toLowerCase() === kw.toLowerCase())
    ).length;
    return matchCount > 0;
  });

  // Score relevance of each piece of evidence
  const scoredEvidence = relevantEvidence.map(e => {
    const matchCount = point.keywords.filter(kw =>
      e.matchedKeywords.some(ek => ek.toLowerCase() === kw.toLowerCase())
    ).length;
    const relevanceScore = (matchCount / point.keywords.length) * 100;
    return { evidence: e, relevanceScore };
  });

  // Sort by relevance and take top evidence
  scoredEvidence.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topEvidence = scoredEvidence.slice(0, 10).map(s => s.evidence);

  // Calculate overall confidence
  const confidence = topEvidence.length > 0 ? scoreEvidence(topEvidence) : 0;

  // Determine status
  let status: VerificationResult['status'];
  const notes: string[] = [];

  if (topEvidence.length === 0) {
    status = 'missing';
    notes.push('No code evidence found matching this requirement');
  } else if (confidence >= 70) {
    status = 'verified';
    notes.push(`Strong evidence found in ${topEvidence.length} location(s)`);
  } else if (confidence >= minConfidence) {
    status = 'partial';
    notes.push(`Partial evidence found, may need review`);

    // Check what might be missing
    const foundTypes = new Set(topEvidence.map(e => e.type));
    if (!foundTypes.has('test')) {
      notes.push('No test coverage found');
    }
    if (!foundTypes.has('error-handling') &&
        point.expectedBehaviors.some(b =>
          b.toLowerCase().includes('error') ||
          b.toLowerCase().includes('reject') ||
          b.toLowerCase().includes('throw')
        )) {
      notes.push('Expected error handling not found');
    }
  } else {
    status = 'unknown';
    notes.push('Evidence confidence too low to verify');
  }

  return {
    point,
    status,
    evidence: topEvidence,
    confidence,
    notes,
  };
}

/**
 * Verify all points against the codebase.
 */
export async function verifyPoints(
  points: VerificationPoint[],
  codebaseRoot: string,
  options: MatchOptions = {}
): Promise<VerificationResult[]> {
  // Collect all keywords from all points
  const allKeywords = new Set<string>();
  for (const point of points) {
    for (const keyword of point.keywords) {
      allKeywords.add(keyword);
    }
  }

  // Scan codebase once with all keywords
  const allEvidence = await scanCodebase(
    codebaseRoot,
    Array.from(allKeywords),
    { includeTests: options.includeTests ?? true }
  );

  // Match each point
  const results: VerificationResult[] = [];
  for (const point of points) {
    const result = matchPoint(point, allEvidence, options);
    results.push(result);
  }

  return results;
}

/**
 * Generate recommendations based on verification results.
 */
export function generateRecommendations(results: VerificationResult[]): string[] {
  const recommendations: string[] = [];
  const missingCount = results.filter(r => r.status === 'missing').length;
  const partialCount = results.filter(r => r.status === 'partial').length;
  const noTestCount = results.filter(r =>
    r.notes.some(n => n.includes('No test'))
  ).length;

  if (missingCount > 0) {
    recommendations.push(
      `${missingCount} requirement(s) have no implementation evidence. Review specs for accuracy or implement missing functionality.`
    );
  }

  if (partialCount > 0) {
    recommendations.push(
      `${partialCount} requirement(s) have partial implementation. Review for completeness.`
    );
  }

  if (noTestCount > 0) {
    recommendations.push(
      `${noTestCount} requirement(s) lack test coverage. Consider adding tests for better verification.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('All requirements have strong implementation evidence.');
  }

  return recommendations;
}
