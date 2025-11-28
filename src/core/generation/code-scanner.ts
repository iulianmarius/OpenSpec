/**
 * Scans code files to extract elements for spec generation.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CodeElement, ParameterInfo, TestCase } from './types.js';

// File extensions to scan
const CODE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.mts', '.mjs'];
const TEST_PATTERNS = ['.test.', '.spec.', '__tests__'];

// Directories to skip
const SKIP_DIRS = ['node_modules', 'dist', 'build', '.git', 'coverage'];

/**
 * Parse JSDoc comment to extract description and tags.
 */
function parseJSDoc(comment: string): {
  description: string;
  params: ParameterInfo[];
  returns?: string;
  throws: string[];
} {
  const result = {
    description: '',
    params: [] as ParameterInfo[],
    returns: undefined as string | undefined,
    throws: [] as string[],
  };

  // Remove comment markers
  const lines = comment
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(l => l);

  let currentDescription = '';

  for (const line of lines) {
    // Parse @param
    const paramMatch = line.match(/@param\s+(?:\{([^}]+)\})?\s*(\w+)\s*(?:-\s*)?(.*)$/);
    if (paramMatch) {
      result.params.push({
        name: paramMatch[2],
        type: paramMatch[1],
        description: paramMatch[3],
      });
      continue;
    }

    // Parse @returns/@return
    const returnMatch = line.match(/@returns?\s+(?:\{([^}]+)\})?\s*(.*)$/);
    if (returnMatch) {
      result.returns = returnMatch[2] || returnMatch[1];
      continue;
    }

    // Parse @throws/@throw
    const throwMatch = line.match(/@throws?\s+(?:\{([^}]+)\})?\s*(.*)$/);
    if (throwMatch) {
      result.throws.push(throwMatch[2] || throwMatch[1] || 'Error');
      continue;
    }

    // Skip other tags
    if (line.startsWith('@')) continue;

    // Accumulate description
    if (currentDescription) {
      currentDescription += ' ' + line;
    } else {
      currentDescription = line;
    }
  }

  result.description = currentDescription;
  return result;
}

/**
 * Extract code elements from a single file.
 */
async function scanFile(filePath: string): Promise<CodeElement[]> {
  const elements: CodeElement[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  let currentJSDoc = '';
  let inJSDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Track JSDoc comments
    if (line.includes('/**')) {
      inJSDoc = true;
      currentJSDoc = line;
      continue;
    }
    if (inJSDoc) {
      currentJSDoc += '\n' + line;
      if (line.includes('*/')) {
        inJSDoc = false;
      }
      continue;
    }

    // Parse function declarations
    const funcMatch = line.match(
      /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\{]+))?/
    );
    if (funcMatch) {
      const jsdoc = parseJSDoc(currentJSDoc);
      elements.push({
        type: 'function',
        name: funcMatch[4],
        file: filePath,
        line: lineNumber,
        description: jsdoc.description,
        parameters: jsdoc.params,
        returnType: funcMatch[6]?.trim(),
        throws: jsdoc.throws,
        isAsync: !!funcMatch[3],
        isExported: !!funcMatch[2],
      });
      currentJSDoc = '';
      continue;
    }

    // Parse arrow function exports
    const arrowMatch = line.match(
      /^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*(?::\s*([^\=\>]+))?\s*=>/
    );
    if (arrowMatch) {
      const jsdoc = parseJSDoc(currentJSDoc);
      elements.push({
        type: 'function',
        name: arrowMatch[4],
        file: filePath,
        line: lineNumber,
        description: jsdoc.description,
        parameters: jsdoc.params,
        returnType: arrowMatch[6]?.trim(),
        throws: jsdoc.throws,
        isAsync: !!arrowMatch[5],
        isExported: !!arrowMatch[2],
      });
      currentJSDoc = '';
      continue;
    }

    // Parse class declarations
    const classMatch = line.match(
      /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/
    );
    if (classMatch) {
      const jsdoc = parseJSDoc(currentJSDoc);
      elements.push({
        type: 'class',
        name: classMatch[4],
        file: filePath,
        line: lineNumber,
        description: jsdoc.description,
        isExported: !!classMatch[2],
      });
      currentJSDoc = '';
      continue;
    }

    // Parse interface declarations
    const interfaceMatch = line.match(
      /^(\s*)(export\s+)?interface\s+(\w+)/
    );
    if (interfaceMatch) {
      const jsdoc = parseJSDoc(currentJSDoc);
      elements.push({
        type: 'interface',
        name: interfaceMatch[3],
        file: filePath,
        line: lineNumber,
        description: jsdoc.description,
        isExported: !!interfaceMatch[2],
      });
      currentJSDoc = '';
      continue;
    }

    // Parse type declarations
    const typeMatch = line.match(
      /^(\s*)(export\s+)?type\s+(\w+)/
    );
    if (typeMatch) {
      const jsdoc = parseJSDoc(currentJSDoc);
      elements.push({
        type: 'type',
        name: typeMatch[3],
        file: filePath,
        line: lineNumber,
        description: jsdoc.description,
        isExported: !!typeMatch[2],
      });
      currentJSDoc = '';
      continue;
    }

    // Reset JSDoc if we hit a non-matching line
    if (!line.trim().startsWith('//') && line.trim()) {
      currentJSDoc = '';
    }
  }

  return elements;
}

/**
 * Extract test cases from a test file.
 */
async function scanTestFile(filePath: string): Promise<TestCase[]> {
  const testCases: TestCase[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  let currentDescribe = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Match describe blocks
    const describeMatch = line.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (describeMatch) {
      currentDescribe = describeMatch[1];
      testCases.push({
        description: describeMatch[1],
        file: filePath,
        line: lineNumber,
        type: 'describe',
      });
      continue;
    }

    // Match it/test blocks
    const testMatch = line.match(/(it|test)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (testMatch) {
      testCases.push({
        description: testMatch[2],
        file: filePath,
        line: lineNumber,
        type: testMatch[1] as 'it' | 'test',
        parentDescribe: currentDescribe,
      });
    }
  }

  return testCases;
}

/**
 * Scan a directory for code elements.
 */
export async function scanDirectory(
  dir: string,
  options: { includeTests?: boolean } = {}
): Promise<{ elements: CodeElement[]; tests: TestCase[] }> {
  const elements: CodeElement[] = [];
  const tests: TestCase[] = [];

  async function scan(currentDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.includes(entry.name)) continue;
          await scan(fullPath);
        } else {
          const ext = path.extname(entry.name);
          if (!CODE_EXTENSIONS.includes(ext)) continue;

          const isTest = TEST_PATTERNS.some(p => fullPath.includes(p));

          if (isTest) {
            if (options.includeTests) {
              const fileTests = await scanTestFile(fullPath);
              tests.push(...fileTests);
            }
          } else {
            try {
              const fileElements = await scanFile(fullPath);
              elements.push(...fileElements);
            } catch {
              // Skip files that can't be parsed
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  await scan(dir);
  return { elements, tests };
}

/**
 * Group code elements by logical capability.
 */
export function groupByCapability(elements: CodeElement[]): Map<string, CodeElement[]> {
  const groups = new Map<string, CodeElement[]>();

  for (const element of elements) {
    // Use directory name as capability identifier
    const dir = path.dirname(element.file);
    const capability = path.basename(dir);

    const existing = groups.get(capability) || [];
    existing.push(element);
    groups.set(capability, existing);
  }

  return groups;
}
