import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { ConversationModule } from '../../src/modules/conversation/conversation.module';
import { DatabaseModule } from '../../src/database/database.module';
import { PrismaService } from '../../src/database/prisma.service';
import type { ExecutionContext } from '@nestjs/common';
import type { Principal } from '../../src/common/auth/principal';

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

describe('Conversation HTTP (e2e)', () => {
  let app: INestApplication;
  let prismaMock: {
    conversation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeAll(async () => {
    prismaMock = {
      conversation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule, ConversationModule],
      providers: [
        { provide: APP_GUARD, useValue: mockJwtGuard },
        { provide: APP_GUARD, useValue: mockQuotaGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
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

  const conv = (overrides = {}) => ({
    id: 'conv-1',
    title: 'Test Conversation',
    ownerUserId: 'user-1',
    lastActivityAt: new Date('2026-07-30T00:00:00Z'),
    createdAt: new Date('2026-07-30T00:00:00Z'),
    updatedAt: new Date('2026-07-30T00:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/conversations', () => {
    it('returns 200 with paginated conversations', async () => {
      prismaMock.conversation.findMany.mockResolvedValue([conv()]);
      const res = await request(app.getHttpServer())
        .get('/v1/conversations')
        .set('Authorization', 'Bearer test-token')
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBeDefined();
      expect(res.body.page.nextCursor).toBeNull();
    });

    it('returns 400 on malformed cursor', async () => {
      await request(app.getHttpServer())
        .get('/v1/conversations?cursor=!!!bad!!!')
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });
  });

  describe('POST /v1/conversations', () => {
    it('returns 201 with created conversation', async () => {
      prismaMock.conversation.create.mockResolvedValue(
        conv({ title: 'My Chat' }),
      );
      const res = await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'My Chat' })
        .expect(201);
      expect(res.body.id).toBe('conv-1');
      expect(res.body.title).toBe('My Chat');
    });

    it('defaults title when omitted', async () => {
      prismaMock.conversation.create.mockResolvedValue(
        conv({ title: 'New conversation' }),
      );
      const res = await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', 'Bearer test-token')
        .send({})
        .expect(201);
      expect(res.body.title).toBe('New conversation');
    });

    it('returns 400 when title is empty after trim', async () => {
      await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', 'Bearer test-token')
        .send({ title: '   ' })
        .expect(400);
    });

    it('returns 400 when title is null', async () => {
      await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', 'Bearer test-token')
        .send({ title: null })
        .expect(400);
    });

    it('returns 400 when title exceeds 200 characters', async () => {
      await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'A'.repeat(201) })
        .expect(400);
    });
  });

  describe('GET /v1/conversations/:id', () => {
    it('returns 200 for owned conversation', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(conv());
      const res = await request(app.getHttpServer())
        .get('/v1/conversations/00000000-0000-0000-0000-000000000001')
        .set('Authorization', 'Bearer test-token')
        .expect(200);
      expect(res.body.id).toBe('conv-1');
    });

    it('returns 404 for cross-user conversation', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get('/v1/conversations/00000000-0000-0000-0000-000000000099')
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('returns 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/v1/conversations/not-a-uuid')
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });
  });

  describe('PATCH /v1/conversations/:id', () => {
    it('returns 200 with updated conversation', async () => {
      prismaMock.conversation.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.conversation.findFirst.mockResolvedValue(
        conv({ title: 'Updated' }),
      );
      const res = await request(app.getHttpServer())
        .patch('/v1/conversations/00000000-0000-0000-0000-000000000001')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Updated' })
        .expect(200);
      expect(res.body.title).toBe('Updated');
    });

    it('returns 400 when title is empty string', async () => {
      await request(app.getHttpServer())
        .patch('/v1/conversations/00000000-0000-0000-0000-000000000001')
        .set('Authorization', 'Bearer test-token')
        .send({ title: '' })
        .expect(400);
    });

    it('returns 404 when not owned (updateMany count = 0)', async () => {
      prismaMock.conversation.updateMany.mockResolvedValue({ count: 0 });
      await request(app.getHttpServer())
        .patch('/v1/conversations/00000000-0000-0000-0000-000000000099')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /v1/conversations/:id', () => {
    it('returns 204 on success', async () => {
      prismaMock.conversation.deleteMany.mockResolvedValue({ count: 1 });
      await request(app.getHttpServer())
        .delete('/v1/conversations/00000000-0000-0000-0000-000000000001')
        .set('Authorization', 'Bearer test-token')
        .expect(204);
    });

    it('returns 404 for non-owned conversation', async () => {
      prismaMock.conversation.deleteMany.mockResolvedValue({ count: 0 });
      await request(app.getHttpServer())
        .delete('/v1/conversations/00000000-0000-0000-0000-000000000099')
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });
});
