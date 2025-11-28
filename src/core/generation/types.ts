/**
 * Types for spec generation from code.
 */

export interface CodeElement {
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'constant';
  name: string;
  file: string;
  line: number;
  description?: string;
  parameters?: ParameterInfo[];
  returnType?: string;
  throws?: string[];
  visibility?: 'public' | 'private' | 'protected';
  isAsync?: boolean;
  isExported?: boolean;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  description?: string;
  optional?: boolean;
}

export interface TestCase {
  description: string;
  file: string;
  line: number;
  type: 'it' | 'test' | 'describe';
  parentDescribe?: string;
}

export interface GeneratedRequirement {
  name: string;
  description: string;
  scenarios: GeneratedScenario[];
  sourceElements: CodeElement[];
  sourceTests: TestCase[];
  confidence: 'high' | 'medium' | 'low';
}

export interface GeneratedScenario {
  name: string;
  given?: string;
  when: string;
  then: string;
  source?: 'test' | 'code' | 'inferred';
  sourceFile?: string;
  sourceLine?: number;
}

export interface GeneratedSpec {
  capabilityId: string;
  title: string;
  purpose: string;
  sourceFiles: string[];
  requirements: GeneratedRequirement[];
  generatedAt: string;
  confidence: 'high' | 'medium' | 'low';
  reviewChecklist: string[];
}

export interface GenerateOptions {
  fromTests?: boolean;
  fromOpenAPI?: string;
  interactive?: boolean;
  output?: string;
  dryRun?: boolean;
}
