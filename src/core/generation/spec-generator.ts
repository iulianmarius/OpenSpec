/**
 * Generates spec markdown from code elements.
 */

import path from 'path';
import {
  CodeElement,
  TestCase,
  GeneratedRequirement,
  GeneratedScenario,
  GeneratedSpec,
} from './types.js';

/**
 * Convert a test description to a scenario.
 */
function testToScenario(test: TestCase): GeneratedScenario {
  const description = test.description;

  // Try to parse "should X when Y" pattern
  const shouldWhenMatch = description.match(/should\s+(.+?)\s+when\s+(.+)/i);
  if (shouldWhenMatch) {
    return {
      name: description,
      when: shouldWhenMatch[2],
      then: shouldWhenMatch[1],
      source: 'test',
      sourceFile: test.file,
      sourceLine: test.line,
    };
  }

  // Try to parse "X when Y" pattern
  const whenMatch = description.match(/(.+?)\s+when\s+(.+)/i);
  if (whenMatch) {
    return {
      name: description,
      when: whenMatch[2],
      then: whenMatch[1],
      source: 'test',
      sourceFile: test.file,
      sourceLine: test.line,
    };
  }

  // Try to parse "should X" pattern
  const shouldMatch = description.match(/should\s+(.+)/i);
  if (shouldMatch) {
    return {
      name: description,
      when: 'the operation is performed',
      then: shouldMatch[1],
      source: 'test',
      sourceFile: test.file,
      sourceLine: test.line,
    };
  }

  // Default: use description as the "then"
  return {
    name: description,
    when: 'the operation is performed',
    then: description,
    source: 'test',
    sourceFile: test.file,
    sourceLine: test.line,
  };
}

/**
 * Generate scenarios from code element analysis.
 */
function elementToScenarios(element: CodeElement): GeneratedScenario[] {
  const scenarios: GeneratedScenario[] = [];

  // Generate success scenario
  if (element.description || element.returnType) {
    scenarios.push({
      name: `${element.name} succeeds`,
      when: `${element.name} is called with valid inputs`,
      then: element.description || `returns ${element.returnType || 'result'}`,
      source: 'code',
      sourceFile: element.file,
      sourceLine: element.line,
    });
  }

  // Generate error scenarios from throws
  if (element.throws && element.throws.length > 0) {
    for (const throwType of element.throws) {
      scenarios.push({
        name: `${element.name} throws ${throwType}`,
        when: 'invalid conditions are met',
        then: `${throwType} is thrown`,
        source: 'code',
        sourceFile: element.file,
        sourceLine: element.line,
      });
    }
  }

  return scenarios;
}

/**
 * Convert function name to human-readable requirement name.
 */
function nameToTitle(name: string): string {
  // Convert camelCase/PascalCase to Title Case
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Generate requirements from code elements and tests.
 */
function generateRequirements(
  elements: CodeElement[],
  tests: TestCase[]
): GeneratedRequirement[] {
  const requirements: GeneratedRequirement[] = [];

  // Group tests by their describe block or function name
  const testsByGroup = new Map<string, TestCase[]>();
  for (const test of tests) {
    const group = test.parentDescribe || 'General';
    const existing = testsByGroup.get(group) || [];
    existing.push(test);
    testsByGroup.set(group, existing);
  }

  // Create requirements from exported functions/classes
  for (const element of elements) {
    if (!element.isExported) continue;
    if (element.type !== 'function' && element.type !== 'class') continue;

    const relatedTests = tests.filter(t =>
      t.parentDescribe?.toLowerCase().includes(element.name.toLowerCase()) ||
      t.description.toLowerCase().includes(element.name.toLowerCase())
    );

    // Generate scenarios from code and tests
    const scenarios: GeneratedScenario[] = [];

    // From tests (higher confidence)
    for (const test of relatedTests) {
      if (test.type !== 'describe') {
        scenarios.push(testToScenario(test));
      }
    }

    // From code analysis (if no tests found)
    if (scenarios.length === 0) {
      scenarios.push(...elementToScenarios(element));
    }

    // Determine confidence
    let confidence: GeneratedRequirement['confidence'] = 'low';
    if (relatedTests.length > 0 && element.description) {
      confidence = 'high';
    } else if (relatedTests.length > 0 || element.description) {
      confidence = 'medium';
    }

    requirements.push({
      name: nameToTitle(element.name),
      description: element.description ||
        `The system SHALL provide ${nameToTitle(element.name).toLowerCase()} functionality.`,
      scenarios,
      sourceElements: [element],
      sourceTests: relatedTests,
      confidence,
    });
  }

  // Create requirements from describe blocks without matching elements
  for (const [group, groupTests] of testsByGroup) {
    const hasMatchingElement = elements.some(e =>
      e.name.toLowerCase() === group.toLowerCase() ||
      group.toLowerCase().includes(e.name.toLowerCase())
    );

    if (!hasMatchingElement && groupTests.length > 0) {
      const scenarios = groupTests
        .filter(t => t.type !== 'describe')
        .map(testToScenario);

      if (scenarios.length > 0) {
        requirements.push({
          name: group,
          description: `The system SHALL provide ${group.toLowerCase()} functionality.`,
          scenarios,
          sourceElements: [],
          sourceTests: groupTests,
          confidence: 'medium',
        });
      }
    }
  }

  return requirements;
}

/**
 * Generate a complete spec from code analysis.
 */
export function generateSpec(
  capabilityId: string,
  elements: CodeElement[],
  tests: TestCase[]
): GeneratedSpec {
  const requirements = generateRequirements(elements, tests);

  // Calculate overall confidence
  let confidence: GeneratedSpec['confidence'] = 'low';
  const highConfCount = requirements.filter(r => r.confidence === 'high').length;
  const medConfCount = requirements.filter(r => r.confidence === 'medium').length;

  if (highConfCount > requirements.length / 2) {
    confidence = 'high';
  } else if (highConfCount + medConfCount > requirements.length / 2) {
    confidence = 'medium';
  }

  // Collect source files
  const sourceFiles = new Set<string>();
  for (const element of elements) {
    sourceFiles.add(element.file);
  }
  for (const test of tests) {
    sourceFiles.add(test.file);
  }

  // Generate title
  const title = nameToTitle(capabilityId) + ' Specification';

  // Generate purpose
  const purpose = `This specification defines the ${nameToTitle(capabilityId).toLowerCase()} capabilities of the system.`;

  // Generate review checklist
  const reviewChecklist = [
    'Verify requirement names are accurate',
    'Add missing scenarios',
    'Remove implementation details from specs',
    'Add business context to "Purpose" section',
    'Review auto-generated descriptions for accuracy',
  ];

  return {
    capabilityId,
    title,
    purpose,
    sourceFiles: Array.from(sourceFiles),
    requirements,
    generatedAt: new Date().toISOString(),
    confidence,
    reviewChecklist,
  };
}

/**
 * Convert a generated spec to markdown.
 */
export function specToMarkdown(spec: GeneratedSpec): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${spec.title} (AUTO-GENERATED)`);
  lines.push('');
  lines.push('> ⚠️ This spec was auto-generated from code analysis.');
  lines.push('> Please review and refine before using as source of truth.');
  lines.push('');

  // Purpose
  lines.push('## Purpose');
  lines.push(spec.purpose);
  lines.push('');

  // Source files
  lines.push('## Source Files');
  for (const file of spec.sourceFiles.slice(0, 10)) {
    lines.push(`- ${file}`);
  }
  if (spec.sourceFiles.length > 10) {
    lines.push(`- ... and ${spec.sourceFiles.length - 10} more`);
  }
  lines.push('');

  // Requirements
  lines.push('## Requirements');
  lines.push('');

  for (const req of spec.requirements) {
    lines.push(`### Requirement: ${req.name}`);
    lines.push(req.description);
    lines.push('');

    // Add source reference
    if (req.sourceElements.length > 0) {
      const el = req.sourceElements[0];
      lines.push(`> Generated from: \`${el.name}()\` in ${el.file}:${el.line}`);
      lines.push(`> Confidence: ${req.confidence.charAt(0).toUpperCase() + req.confidence.slice(1)}${req.sourceTests.length > 0 ? ' (tests found)' : ''}`);
      lines.push('');
    }

    // Scenarios
    for (const scenario of req.scenarios) {
      lines.push(`#### Scenario: ${scenario.name}`);

      if (scenario.given) {
        lines.push(`- **GIVEN** ${scenario.given}`);
      }
      lines.push(`- **WHEN** ${scenario.when}`);
      lines.push(`- **THEN** ${scenario.then}`);
      lines.push('');

      if (scenario.sourceFile) {
        lines.push(`> Evidence: ${scenario.sourceFile}:${scenario.sourceLine}`);
        lines.push('');
      }
    }
  }

  // Review checklist
  lines.push('---');
  lines.push('');
  lines.push('## Review Checklist');
  for (const item of spec.reviewChecklist) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push('');

  return lines.join('\n');
}
