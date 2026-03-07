import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import { validateArchStructure, assertValidArch, ArchValidationError } from '../arch-validator.js';

const VALID_ARCH = `# Architecture Document

## System Components

The system consists of a CLI frontend and an Ollama backend.

## Data Flow

User input flows through the interview engine to the model provider.

## External Integrations

Ollama is integrated via its HTTP API.

## Storage

Session files are written to ~/.cobuild/sessions/.

## Deployment

The CLI runs as a local Node.js process with no cloud dependencies.

## Security Considerations

No secrets are stored. All data is local.

## Failure Handling

Retry logic wraps all model calls with exponential backoff.
`;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('validateArchStructure', () => {
  it('returns valid for an architecture doc with all required sections', () => {
    const result = validateArchStructure(VALID_ARCH);
    expect(result.valid).toBe(true);
    expect(result.missingSections).toHaveLength(0);
  });

  it('returns invalid when system components is missing', () => {
    const content = VALID_ARCH.replace(/## System Components[\s\S]*?(?=##)/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('system components');
  });

  it('returns invalid when data flow is missing', () => {
    const content = VALID_ARCH.replace(/## Data Flow[\s\S]*?(?=##)/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('data flow');
  });

  it('returns invalid when external integrations is missing', () => {
    const content = VALID_ARCH.replace(/## External Integrations[\s\S]*?(?=##)/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('external integrations');
  });

  it('returns invalid when storage choices is missing', () => {
    const content = VALID_ARCH.replace(/## Storage[\s\S]*?(?=##)/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('storage choices');
  });

  it('returns invalid when deployment/runtime model is missing', () => {
    const content = VALID_ARCH.replace(/## Deployment[\s\S]*?(?=##)/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('deployment/runtime model');
  });

  it('returns invalid when security considerations is missing', () => {
    const content = VALID_ARCH.replace(/## Security Considerations[\s\S]*?(?=##)/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('security considerations');
  });

  it('returns invalid when failure handling is missing', () => {
    const content = VALID_ARCH.replace(/## Failure Handling[\s\S]*$/, '');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('failure handling');
  });

  it('lists all missing sections when content is empty', () => {
    const result = validateArchStructure('# Title\n\nNo sections here.\n');
    expect(result.valid).toBe(false);
    expect(result.missingSections).toHaveLength(7);
    expect(result.missingSections).toContain('system components');
    expect(result.missingSections).toContain('data flow');
    expect(result.missingSections).toContain('external integrations');
    expect(result.missingSections).toContain('storage choices');
    expect(result.missingSections).toContain('deployment/runtime model');
    expect(result.missingSections).toContain('security considerations');
    expect(result.missingSections).toContain('failure handling');
  });

  it('accepts "Components" as system components heading', () => {
    const content = VALID_ARCH.replace('## System Components', '## Components');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Architecture Overview" as system components heading', () => {
    const content = VALID_ARCH.replace('## System Components', '## Architecture Overview');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Integrations" as external integrations heading', () => {
    const content = VALID_ARCH.replace('## External Integrations', '## Integrations');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Database" as storage choices heading', () => {
    const content = VALID_ARCH.replace('## Storage', '## Database');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Infrastructure" as deployment heading', () => {
    const content = VALID_ARCH.replace('## Deployment', '## Infrastructure');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Error Handling" as failure handling heading', () => {
    const content = VALID_ARCH.replace('## Failure Handling', '## Error Handling');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Fault Tolerance" as failure handling heading', () => {
    const content = VALID_ARCH.replace('## Failure Handling', '## Fault Tolerance');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('is case-insensitive for section headings', () => {
    const content = VALID_ARCH
      .replace('## System Components', '## SYSTEM COMPONENTS')
      .replace('## Data Flow', '## DATA FLOW')
      .replace('## Security Considerations', '## SECURITY CONSIDERATIONS')
      .replace('## Failure Handling', '## FAILURE HANDLING');
    const result = validateArchStructure(content);
    expect(result.valid).toBe(true);
  });

  it('logs an error when validation fails', () => {
    validateArchStructure('no sections here');
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/missing sections/);
  });

  it('logs info when validation passes', () => {
    validateArchStructure(VALID_ARCH);
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/valid/);
  });
});

describe('assertValidArch', () => {
  it('does not throw for a valid architecture document', () => {
    expect(() => assertValidArch(VALID_ARCH)).not.toThrow();
  });

  it('throws ArchValidationError for an invalid architecture document', () => {
    expect(() => assertValidArch('no sections')).toThrow(ArchValidationError);
  });

  it('thrown error contains the validation result', () => {
    expect.assertions(3);
    try {
      assertValidArch('no sections');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchValidationError);
      const validationErr = err as ArchValidationError;
      expect(validationErr.result.valid).toBe(false);
      expect(validationErr.result.missingSections.length).toBeGreaterThan(0);
    }
  });

  it('thrown error message includes missing section names', () => {
    expect.assertions(1);
    try {
      assertValidArch('no sections');
    } catch (err) {
      expect((err as Error).message).toMatch(/system components/);
    }
  });
});
