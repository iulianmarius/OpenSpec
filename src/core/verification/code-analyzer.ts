/**
 * Analyzes code to find evidence of spec implementation.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CodeEvidence } from './types.js';

// File extensions to analyze
const CODE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.mts', '.mjs'];
const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', 'test/', 'tests/'];

// Directories to skip
const SKIP_DIRS = ['node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.nuxt'];

interface ScanOptions {
  includeTests?: boolean;
  extensions?: string[];
}

/**
 * Check if a file is a test file.
 */
function isTestFile(filePath: string): boolean {
  return TEST_PATTERNS.some(pattern => filePath.includes(pattern));
}

/**
 * Extract code evidence from a file.
 */
async function analyzeFile(filePath: string, searchKeywords: string[]): Promise<CodeEvidence[]> {
  const evidence: CodeEvidence[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const isTest = isTestFile(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const lowerLine = line.toLowerCase();

    // Check for keyword matches
    const matchedKeywords = searchKeywords.filter(kw =>
      lowerLine.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length === 0) continue;

    // Determine evidence type
    let type: CodeEvidence['type'] = 'function';
    let confidence: CodeEvidence['confidence'] = 'medium';

    // Function/method definitions
    if (/^\s*(export\s+)?(async\s+)?function\s+\w+/i.test(line) ||
        /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/i.test(line) ||
        /^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[:{]/i.test(line)) {
      type = 'function';
      confidence = 'high';
    }
    // Class definitions
    else if (/^\s*(export\s+)?(abstract\s+)?class\s+\w+/i.test(line)) {
      type = 'class';
      confidence = 'high';
    }
    // Test descriptions
    else if (/^\s*(it|test|describe)\s*\(\s*['"`]/i.test(line)) {
      type = 'test';
      confidence = 'high';
    }
    // Error handling
    else if (/throw\s+new\s+\w*Error/i.test(line) ||
             /\.catch\s*\(/i.test(line) ||
             /catch\s*\(/i.test(line)) {
      type = 'error-handling';
      confidence = 'medium';
    }
    // Comments (JSDoc, etc.)
    else if (/^\s*(\/\*\*|\/\/|#)/i.test(line)) {
      type = 'comment';
      confidence = 'low';
    }
    // Type definitions
    else if (/^\s*(export\s+)?(type|interface)\s+\w+/i.test(line)) {
      type = 'type';
      confidence = 'medium';
    }
    // Method calls that match keywords
    else if (matchedKeywords.length >= 2) {
      type = 'method';
      confidence = 'medium';
    }
    else {
      confidence = 'low';
    }

    // Boost confidence for test files matching scenarios
    if (isTest && type === 'test') {
      confidence = 'high';
    }

    evidence.push({
      file: filePath,
      line: lineNumber,
      content: line.trim().slice(0, 200), // Truncate long lines
      type,
      confidence,
      matchedKeywords,
    });
  }

  return evidence;
}

/**
 * Scan a directory for code files and analyze them.
 */
export async function scanCodebase(
  rootDir: string,
  keywords: string[],
  options: ScanOptions = {}
): Promise<CodeEvidence[]> {
  const allEvidence: CodeEvidence[] = [];
  const extensions = options.extensions || CODE_EXTENSIONS;

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.includes(entry.name)) continue;
          await scanDir(fullPath);
        } else {
          const ext = path.extname(entry.name);
          if (!extensions.includes(ext)) continue;

          // Skip test files if not requested
          if (!options.includeTests && isTestFile(fullPath)) continue;

          try {
            const evidence = await analyzeFile(fullPath, keywords);
            allEvidence.push(...evidence);
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  await scanDir(rootDir);
  return allEvidence;
}

/**
 * Group evidence by file for better reporting.
 */
export function groupEvidenceByFile(evidence: CodeEvidence[]): Map<string, CodeEvidence[]> {
  const grouped = new Map<string, CodeEvidence[]>();

  for (const e of evidence) {
    const existing = grouped.get(e.file) || [];
    existing.push(e);
    grouped.set(e.file, existing);
  }

  return grouped;
}

/**
 * Score evidence quality based on confidence and relevance.
 */
export function scoreEvidence(evidence: CodeEvidence[]): number {
  if (evidence.length === 0) return 0;

  let totalScore = 0;
  const confidenceScores = { high: 1.0, medium: 0.6, low: 0.3 };

  for (const e of evidence) {
    let score = confidenceScores[e.confidence];

    // Boost for test files
    if (e.type === 'test') score *= 1.2;

    // Boost for multiple keyword matches
    if (e.matchedKeywords.length > 2) score *= 1.1;

    totalScore += score;
  }

  // Normalize to 0-100
  return Math.min(100, Math.round((totalScore / evidence.length) * 100));
}
