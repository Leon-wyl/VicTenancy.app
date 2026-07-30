import { randomUUID } from 'crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Correlation ID middleware', () => {
  describe('UUID validation (UUID_RE)', () => {
    it('accepts lowercase UUID v4', () => {
      const id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      expect(UUID_RE.test(id)).toBe(true);
    });

    it('accepts uppercase UUID v4', () => {
      const id = 'A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D';
      expect(UUID_RE.test(id)).toBe(true);
    });

    it('rejects non-UUID string', () => {
      expect(UUID_RE.test('not-a-uuid')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(UUID_RE.test('')).toBe(false);
    });

    it('rejects string with only hyphens', () => {
      expect(UUID_RE.test('----')).toBe(false);
    });
  });

  describe('crypto.randomUUID() generates valid UUIDs', () => {
    it('generates a valid UUID', () => {
      const id = randomUUID();
      expect(UUID_RE.test(id)).toBe(true);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => randomUUID()));
      expect(ids.size).toBe(100);
    });
  });
});
