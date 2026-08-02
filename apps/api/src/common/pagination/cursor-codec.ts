import { BadRequestException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type CursorData = Record<string, string>;

export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function validateTimestamp(value: string): void {
  if (!ISO_UTC_RE.test(value)) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  if (d.toISOString() !== value) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
}

export function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new BadRequestException('Invalid or malformed cursor');
    }
    for (const value of Object.values(data)) {
      if (typeof value !== 'string') {
        throw new BadRequestException('Invalid or malformed cursor');
      }
    }
    return data as CursorData;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('Invalid or malformed cursor');
  }
}

export interface ConversationCursorData {
  lastActivityAt: string;
  id: string;
}

export function decodeConversationCursor(
  cursor: string,
): ConversationCursorData {
  const data = decodeCursor(cursor);
  const keys = Object.keys(data);
  if (keys.length !== 2 || !data.lastActivityAt || !data.id) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  if (!UUID_RE.test(data.id)) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  validateTimestamp(data.lastActivityAt);
  return { lastActivityAt: data.lastActivityAt, id: data.id };
}

export interface MessageCursorData {
  createdAt: string;
  id: string;
}

export function decodeMessageCursor(cursor: string): MessageCursorData {
  const data = decodeCursor(cursor);
  const keys = Object.keys(data);
  if (keys.length !== 2 || !data.createdAt || !data.id) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  if (!UUID_RE.test(data.id)) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  validateTimestamp(data.createdAt);
  return { createdAt: data.createdAt, id: data.id };
}

export interface JobCursorData {
  createdAt: string;
  id: string;
}

export function decodeJobCursor(cursor: string): JobCursorData {
  const data = decodeCursor(cursor);
  const keys = Object.keys(data);
  if (keys.length !== 2 || !data.createdAt || !data.id) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  if (!UUID_RE.test(data.id)) {
    throw new BadRequestException('Invalid or malformed cursor');
  }
  validateTimestamp(data.createdAt);
  return { createdAt: data.createdAt, id: data.id };
}
