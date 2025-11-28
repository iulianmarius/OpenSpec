/**
 * Types for spec compliance verification.
 */

export interface VerificationPoint {
  id: string;
  type: 'requirement' | 'scenario';
  name: string;
  description: string;
  keywords: string[];
  expectedBehaviors: string[];
  specFile: string;
  lineNumber?: number;
}

export interface CodeEvidence {
  file: string;
  line: number;
  content: string;
  type: 'function' | 'class' | 'method' | 'test' | 'comment' | 'error-handling' | 'type';
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}

export interface VerificationResult {
  point: VerificationPoint;
  status: 'verified' | 'partial' | 'missing' | 'unknown';
  evidence: CodeEvidence[];
  confidence: number; // 0-100
  notes: string[];
}

export interface ComplianceReport {
  specId: string;
  specFile: string;
  timestamp: string;
  results: VerificationResult[];
  summary: {
    total: number;
    verified: number;
    partial: number;
    missing: number;
    unknown: number;
    compliancePercentage: number;
  };
  recommendations: string[];
}

export interface VerifyOptions {
  verbose?: boolean;
  json?: boolean;
  minCompliance?: number;
  includeTests?: boolean;
  analyzeMethods?: ('static' | 'test-mapping' | 'ai')[];
}
