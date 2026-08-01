import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { MessageModule } from '../../src/modules/message/message.module';
import { DatabaseModule } from '../../src/database/database.module';
import { PrismaService } from '../../src/database/prisma.service';
import { Prisma } from '@prisma/client';
import type { ExecutionContext } from '@nestjs/common';
import type { Principal } from '../../src/common/auth/principal';
import { correlationMiddleware } from '../../src/common/correlation/correlation.middleware';

const PRINCIPAL: Principal = {
  sub: 'user-1',
  email: 'a@b.com',
  role: 'authenticated',
  aud: 'authenticated',
};

const mockJwtGuard = {
  canActivate: jest.fn().mockImplementation((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user: Principal }>();
    req.user = PRINCIPAL;
    return true;
  }),
};

const mockQuotaGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

const convId = '00000000-0000-0000-0000-000000000001';
const validIdempotencyKey = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const mockConversationEntity = {
  id: convId,
  title: 'Test',
  ownerUserId: 'user-1',
  lastActivityAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMessageEntity = {
  id: 'msg-1',
  conversationId: convId,
  authorRole: 'user',
  content: 'Hello',
  metadata: null,
  createdAt: new Date('2026-07-30T00:00:00Z'),
};

const mockJobEntity = {
  id: 'job-1',
  conversationId: convId,
  triggerMessageId: 'msg-1',
  ownerUserId: 'user-1',
  status: 'queued',
  idempotencyKey: validIdempotencyKey,
  correlationId: 'cccccccc-dddd-eeee-ffff-gggggggggggg',
  createdAt: new Date('2026-07-30T00:00:00Z'),
};

describe('Message HTTP (e2e)', () => {
  let app: INestApplication;
  let prismaMock: {
    conversation: { findFirst: jest.Mock; updateMany: jest.Mock };
    message: { findMany: jest.Mock; create: jest.Mock };
    agentJob: { findUnique: jest.Mock; create: jest.Mock };
    agentJobOutbox: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeAll(async () => {
    prismaMock = {
      conversation: { findFirst: jest.fn(), updateMany: jest.fn() },
      message: { findMany: jest.fn(), create: jest.fn() },
      agentJob: { findUnique: jest.fn(), create: jest.fn() },
      agentJobOutbox: { create: jest.fn() },
      $transaction: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule, MessageModule],
      providers: [
        { provide: APP_GUARD, useValue: mockJwtGuard },
        { provide: APP_GUARD, useValue: mockQuotaGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(correlationMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        stopAtFirstError: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupTransactionSuccess = () => {
    prismaMock.$transaction.mockImplementation(async (fn) =>
      fn({
        conversation: {
          findFirst: jest.fn().mockResolvedValue(mockConversationEntity),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        message: { create: jest.fn().mockResolvedValue(mockMessageEntity) },
        agentJob: { create: jest.fn().mockResolvedValue(mockJobEntity) },
        agentJobOutbox: { create: jest.fn() },
      }),
    );
  };

  describe('POST /v1/conversations/:id/messages', () => {
    it('returns 201 on first creation (isReplay: false)', async () => {
      setupTransactionSuccess();

      const res = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ content: 'Hello' })
        .expect(201);

      expect(res.body.message).toBeDefined();
      expect(res.body.job).toBeDefined();
      expect(res.body.message.authorRole).toBe('user');
      expect(res.body.job.status).toBe('queued');
      expect(res.body.isReplay).toBeUndefined();
    });

    it('returns 200 on idempotent replay (isReplay: true)', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['ownerUserId', 'idempotencyKey'] } },
      );
      prismaMock.$transaction.mockRejectedValue(uniqueErr);
      prismaMock.agentJob.findUnique.mockResolvedValue({
        ...mockJobEntity,
        triggerMessage: mockMessageEntity,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ content: 'Hello' })
        .expect(200);

      expect(res.body.message.id).toBe('msg-1');
      expect(res.body.job.id).toBe('job-1');
      expect(res.body.isReplay).toBeUndefined();
    });

    it('returns 400 when Idempotency-Key header is missing', async () => {
      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Hello' })
        .expect(400);
    });

    it('returns 400 when Idempotency-Key is not a UUID', async () => {
      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ content: 'Hello' })
        .expect(400);
    });

    it('returns 400 when content is empty', async () => {
      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ content: '' })
        .expect(400);
    });

    it('returns 400 when content exceeds 4000 characters', async () => {
      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ content: 'A'.repeat(4001) })
        .expect(400);
    });

    it('returns 409 on idempotency key reuse with different content', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['ownerUserId', 'idempotencyKey'] } },
      );
      prismaMock.$transaction.mockRejectedValue(uniqueErr);
      prismaMock.agentJob.findUnique.mockResolvedValue({
        ...mockJobEntity,
        triggerMessage: { ...mockMessageEntity, content: 'Different' },
      });

      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', validIdempotencyKey)
        .send({ content: 'Hello' })
        .expect(409);
    });
  });

  describe('GET /v1/conversations/:id/messages', () => {
    it('returns 200 with paginated messages', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(mockConversationEntity);
      prismaMock.message.findMany.mockResolvedValue([mockMessageEntity]);

      const res = await request(app.getHttpServer())
        .get(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].authorRole).toBe('user');
    });

    it('returns 404 for non-owned conversation', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get(`/v1/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });
});
