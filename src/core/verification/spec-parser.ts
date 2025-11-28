/**
 * Parses spec files to extract verification points.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { VerificationPoint } from './types.js';

// Keywords that indicate behavior/requirements
const BEHAVIOR_KEYWORDS = [
  'shall', 'must', 'should', 'will', 'can', 'cannot',
  'require', 'ensure', 'verify', 'validate', 'check',
  'return', 'throw', 'reject', 'accept', 'allow', 'deny',
  'create', 'update', 'delete', 'read', 'write',
  'authenticate', 'authorize', 'encrypt', 'decrypt',
  'send', 'receive', 'notify', 'log', 'track'
];

/**
 * Extract keywords from text that are relevant for code matching.
 */
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const keywords: Set<string> = new Set();

  // Add behavior keywords found in text
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, '');
    if (BEHAVIOR_KEYWORDS.includes(cleanWord)) {
      keywords.add(cleanWord);
    }
  }

  // Extract camelCase/PascalCase identifiers
  const identifierRegex = /[A-Z]?[a-z]+(?=[A-Z])|[A-Z]+(?=[A-Z][a-z])|[a-z]+|[A-Z][a-z]+/g;
  const matches = text.match(identifierRegex) || [];
  for (const match of matches) {
    if (match.length > 2) {
      keywords.add(match.toLowerCase());
    }
  }

  // Extract quoted strings (likely identifiers)
  const quotedRegex = /[`"']([^`"']+)[`"']/g;
  let quotedMatch;
  while ((quotedMatch = quotedRegex.exec(text)) !== null) {
    keywords.add(quotedMatch[1].toLowerCase());
  }

  return Array.from(keywords);
}

/**
 * Extract expected behaviors from scenario steps.
 */
function extractBehaviors(text: string): string[] {
  const behaviors: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for WHEN/THEN/AND patterns
    if (/^\*?\*?(WHEN|THEN|AND|GIVEN)\*?\*?/i.test(trimmed)) {
      behaviors.push(trimmed.replace(/^\*?\*?(WHEN|THEN|AND|GIVEN)\*?\*?\s*/i, '').trim());
    }
    // Also capture bullet points that describe behavior
    if (/^[-*]\s+/.test(trimmed) && !trimmed.includes('**')) {
      behaviors.push(trimmed.replace(/^[-*]\s+/, '').trim());
    }
  }

  return behaviors;
}

/**
 * Parse a spec file and extract verification points.
 */
export async function parseSpecFile(specPath: string): Promise<VerificationPoint[]> {
  const content = await fs.readFile(specPath, 'utf-8');
  const points: VerificationPoint[] = [];
  const lines = content.split('\n');

  let currentRequirement: Partial<VerificationPoint> | null = null;
  let currentScenario: Partial<VerificationPoint> | null = null;
  let scenarioContent: string[] = [];
  let requirementLineNumber = 0;
  let scenarioLineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Match requirement header: ### Requirement: Name
    const reqMatch = line.match(/^###\s+Requirement:\s*(.+)$/i);
    if (reqMatch) {
      // Save previous scenario if exists
      if (currentScenario && scenarioContent.length > 0) {
        const fullContent = scenarioContent.join('\n');
        currentScenario.keywords = extractKeywords(fullContent);
        currentScenario.expectedBehaviors = extractBehaviors(fullContent);
        points.push(currentScenario as VerificationPoint);
      }
      scenarioContent = [];
      currentScenario = null;

      // Start new requirement
      currentRequirement = {
        id: `req-${points.length + 1}`,
        type: 'requirement',
        name: reqMatch[1].trim(),
        description: '',
        keywords: [],
        expectedBehaviors: [],
        specFile: specPath,
        lineNumber,
      };
      requirementLineNumber = lineNumber;
      continue;
    }

    // Match scenario header: #### Scenario: Name
    const scenarioMatch = line.match(/^####\s+Scenario:\s*(.+)$/i);
    if (scenarioMatch) {
      // Save previous scenario if exists
      if (currentScenario && scenarioContent.length > 0) {
        const fullContent = scenarioContent.join('\n');
        currentScenario.keywords = extractKeywords(fullContent);
        currentScenario.expectedBehaviors = extractBehaviors(fullContent);
        points.push(currentScenario as VerificationPoint);
      }

      // Start new scenario
      currentScenario = {
        id: `scenario-${points.length + 1}`,
        type: 'scenario',
        name: scenarioMatch[1].trim(),
        description: currentRequirement?.name || '',
        keywords: [],
        expectedBehaviors: [],
        specFile: specPath,
        lineNumber,
      };
      scenarioContent = [];
      scenarioLineNumber = lineNumber;
      continue;
    }

    // Collect content for current scenario
    if (currentScenario) {
      scenarioContent.push(line);
    }

    // Collect description for requirement (lines between requirement and first scenario)
    if (currentRequirement && !currentScenario && line.trim()) {
      if (!currentRequirement.description) {
        currentRequirement.description = line.trim();
      } else {
        currentRequirement.description += ' ' + line.trim();
      }
    }
  }

  // Save last scenario
  if (currentScenario && scenarioContent.length > 0) {
    const fullContent = scenarioContent.join('\n');
    currentScenario.keywords = extractKeywords(fullContent);
    currentScenario.expectedBehaviors = extractBehaviors(fullContent);
    points.push(currentScenario as VerificationPoint);
  }

  // Add requirement-level verification points with aggregated keywords
  const requirementPoints = new Map<string, VerificationPoint>();
  for (const point of points) {
    if (point.type === 'scenario' && point.description) {
      const reqName = point.description;
      if (!requirementPoints.has(reqName)) {
        requirementPoints.set(reqName, {
          id: `req-${requirementPoints.size + 1}`,
          type: 'requirement',
          name: reqName,
          description: '',
          keywords: [],
          expectedBehaviors: [],
          specFile: specPath,
        });
      }
      const req = requirementPoints.get(reqName)!;
      req.keywords = [...new Set([...req.keywords, ...point.keywords])];
      req.expectedBehaviors = [...req.expectedBehaviors, ...point.expectedBehaviors];
    }
  }

  return points;
}

/**
 * Parse all spec files in a directory.
 */
export async function parseSpecDirectory(specsDir: string): Promise<Map<string, VerificationPoint[]>> {
  const results = new Map<string, VerificationPoint[]>();

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name === 'spec.md') {
          const points = await parseSpecFile(fullPath);
          results.set(fullPath, points);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  await scanDir(specsDir);
  return results;
}
