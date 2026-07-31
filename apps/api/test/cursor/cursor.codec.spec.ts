import {
  encodeCursor,
  decodeCursor,
  decodeConversationCursor,
  decodeMessageCursor,
} from '../../src/common/pagination/cursor-codec';
import { BadRequestException } from '@nestjs/common';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID2 = '00000000-0000-0000-0000-000000000002';
const VALID_ISO = '2026-07-30T00:00:00.000Z';
const VALID_ISO2 = '2026-01-01T00:00:00.000Z';

describe('cursor-codec', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a valid object', () => {
      const data = { lastActivityAt: VALID_ISO, id: VALID_UUID };
      const encoded = encodeCursor(data);
      expect(typeof encoded).toBe('string');
      expect(decodeCursor(encoded)).toEqual(data);
    });

    it('throws BadRequestException on malformed base64', () => {
      expect(() => decodeCursor('!!!not.valid.base64!!!')).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException on non-object JSON', () => {
      const encoded = Buffer.from('"just-a-string"').toString('base64url');
      expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
    });

    it('throws BadRequestException on array JSON', () => {
      const encoded = Buffer.from('[1,2,3]').toString('base64url');
      expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
    });

    it('throws BadRequestException on null JSON', () => {
      const encoded = Buffer.from('null').toString('base64url');
      expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
    });

    it('throws BadRequestException on non-string field values', () => {
      const encoded = Buffer.from(
        JSON.stringify({ lastActivityAt: 123, id: VALID_UUID }),
      ).toString('base64url');
      expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
    });
  });

  describe('decodeConversationCursor', () => {
    it('decodes a valid conversation cursor', () => {
      const encoded = encodeCursor({
        lastActivityAt: VALID_ISO,
        id: VALID_UUID,
      });
      const result = decodeConversationCursor(encoded);
      expect(result).toEqual({ lastActivityAt: VALID_ISO, id: VALID_UUID });
    });

    it('throws on extra unknown fields', () => {
      const encoded = encodeCursor({
        lastActivityAt: VALID_ISO,
        id: VALID_UUID,
        extra: 'field',
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws when lastActivityAt is missing', () => {
      const encoded = encodeCursor({ id: VALID_UUID });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws when id is missing', () => {
      const encoded = encodeCursor({ lastActivityAt: VALID_ISO });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on invalid UUID', () => {
      const encoded = encodeCursor({
        lastActivityAt: VALID_ISO,
        id: 'not-a-uuid',
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on impossible date (month 99)', () => {
      const encoded = encodeCursor({
        lastActivityAt: '2026-99-99T99:99:99.999Z',
        id: VALID_UUID,
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on impossible date (day 99)', () => {
      const encoded = encodeCursor({
        lastActivityAt: '2026-01-99T00:00:00.000Z',
        id: VALID_UUID,
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on non-UTC timestamp (missing Z)', () => {
      const encoded = encodeCursor({
        lastActivityAt: '2026-07-30T00:00:00.000+00:00',
        id: VALID_UUID,
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on non-millisecond timestamp', () => {
      const encoded = encodeCursor({
        lastActivityAt: '2026-07-30T00:00:00Z',
        id: VALID_UUID,
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on non-ISO date (missing time)', () => {
      const encoded = encodeCursor({
        lastActivityAt: '2026-07-30',
        id: VALID_UUID,
      });
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });

    it('throws on non-string id', () => {
      const encoded = Buffer.from(
        JSON.stringify({ lastActivityAt: VALID_ISO, id: 123 }),
      ).toString('base64url');
      expect(() => decodeConversationCursor(encoded)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('decodeMessageCursor', () => {
    it('decodes a valid message cursor', () => {
      const encoded = encodeCursor({ createdAt: VALID_ISO2, id: VALID_UUID2 });
      const result = decodeMessageCursor(encoded);
      expect(result).toEqual({ createdAt: VALID_ISO2, id: VALID_UUID2 });
    });

    it('throws on extra unknown fields', () => {
      const encoded = encodeCursor({
        createdAt: VALID_ISO,
        id: VALID_UUID,
        extra: 'nope',
      });
      expect(() => decodeMessageCursor(encoded)).toThrow(BadRequestException);
    });

    it('throws on invalid UUID', () => {
      const encoded = encodeCursor({
        createdAt: VALID_ISO,
        id: 'abc-123',
      });
      expect(() => decodeMessageCursor(encoded)).toThrow(BadRequestException);
    });

    it('throws on impossible date', () => {
      const encoded = encodeCursor({
        createdAt: '2026-99-01T00:00:00.000Z',
        id: VALID_UUID,
      });
      expect(() => decodeMessageCursor(encoded)).toThrow(BadRequestException);
    });

    it('throws on non-UTC timestamp', () => {
      const encoded = encodeCursor({
        createdAt: '2026-07-30T00:00:00.000+05:00',
        id: VALID_UUID,
      });
      expect(() => decodeMessageCursor(encoded)).toThrow(BadRequestException);
    });
  });
});
