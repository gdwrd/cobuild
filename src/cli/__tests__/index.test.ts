import { describe, it, expect } from 'vitest';

describe('CLI entrypoint', () => {
  it('should have a valid package name', async () => {
    const { readFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name: string; bin: Record<string, string> };
    expect(pkg.name).toBe('cobuild');
    expect(pkg.bin['cobuild']).toBeDefined();
  });
});
