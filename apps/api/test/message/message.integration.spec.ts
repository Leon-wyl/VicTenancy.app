import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { resolve } from 'path';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap/app.factory';

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const DIRECT_DATABASE_URL =
  process.env.DIRECT_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Message Creation Integration', () => {
  let app: INestApplication;
  let pgPool: Pool;
  const authUserIds = new Set<string>();

  beforeAll(async () => {
    pgPool = new Pool({ connectionString: DIRECT_DATABASE_URL });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  }, 30000);

  afterEach(async () => {
    await Promise.all([...authUserIds].map(deleteAuthUser));
    authUserIds.clear();
  });

  afterAll(async () => {
    await app.close();
    await pgPool.end();
  });

  async function signUp(email: string) {
    if (!SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('SUPABASE_PUBLISHABLE_KEY is required for integration tests');
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ email, password: 'Password123!' }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Signup failed: ${JSON.stringify(body)}`);
    if (!body.access_token || !body.user?.id) {
      throw new Error(`Signup returned no session: ${JSON.stringify(body)}`);
    }
    authUserIds.add(body.user.id);
    return { token: body.access_token, userId: body.user.id };
  }

  async function createConversation(
    token: string,
    title = 'Test',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title });
    return res.body.id;
  }

  async function deleteAuthUser(userId: string) {
    await pgPool.query('DELETE FROM auth.users WHERE id = $1', [userId]);
  }

  function testEmail(prefix: string): string {
    return `${prefix}-${randomUUID()}@example.test`;
  }

  it('submits a message and creates exactly one queued job', async () => {
    const user = await signUp(testEmail('msg-int'));
    const conversationId = await createConversation(user.token);

    const msgRes = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ content: 'What are my rights?' })
      .expect(201);

    expect(msgRes.body.message.authorRole).toBe('user');
    expect(msgRes.body.job.status).toBe('queued');
    expect(msgRes.body.job.triggerMessageId).toBe(msgRes.body.message.id);

    const listRes = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(1);

  }, 30000);

  it('idempotent replay returns same message and job with 200', async () => {
    const user = await signUp(testEmail('idem-int'));
    const conversationId = await createConversation(user.token);
    const idempotencyKey = randomUUID();

    const res1 = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ content: 'Hello' })
      .expect(201);

    const res2 = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ content: 'Hello' })
      .expect(200);

    expect(res2.body.message.id).toBe(res1.body.message.id);
    expect(res2.body.job.id).toBe(res1.body.job.id);

    const listRes = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(1);

  }, 30000);

  it('user cannot submit message to another users conversation', async () => {
    const userA = await signUp(testEmail('iso-msg-a'));
    const userB = await signUp(testEmail('iso-msg-b'));

    const convId = await createConversation(userA.token, 'Private');

    await request(app.getHttpServer())
      .post(`/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${userB.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ content: 'Intruder!' })
      .expect(404);

  }, 30000);

  it('message pagination with cursor works', async () => {
    const user = await signUp(testEmail('msg-pag-int'));
    const conversationId = await createConversation(user.token);

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ content: `Message ${i}` });
    }

    const page1 = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages?limit=2`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.data[0].content).toBe('Message 0');
    expect(page1.body.data[1].content).toBe('Message 1');
    expect(page1.body.page.nextCursor).toBeDefined();

    const page2 = await request(app.getHttpServer())
      .get(
        `/v1/conversations/${conversationId}/messages?limit=2&cursor=${encodeURIComponent(page1.body.page.nextCursor)}`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.data[0].content).toBe('Message 2');
    expect(page2.body.page.nextCursor).toBeNull();

  }, 30000);

  it('concurrent identical requests produce exactly one message and one job', async () => {
    const user = await signUp(testEmail('concurrent'));
    const conversationId = await createConversation(user.token, 'Concurrent');

    const idempotencyKey = randomUUID();
    const knownRequestId = randomUUID();
    const secondRequestId = randomUUID();
    const content = 'Concurrent test message';

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .set('X-Request-Id', knownRequestId)
        .send({ content }),
      request(app.getHttpServer())
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .set('X-Request-Id', secondRequestId)
        .send({ content }),
    ]);

    expect(res1.status).toBeLessThan(400);
    expect(res2.status).toBeLessThan(400);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 201]);

    expect(res1.body.message.id).toBe(res2.body.message.id);
    expect(res1.body.job.id).toBe(res2.body.job.id);

    expect(res1.body.isReplay).toBeUndefined();
    expect(res2.body.isReplay).toBeUndefined();

    const { rows: msgRows } = await pgPool.query(
      'SELECT count(*) as cnt FROM public.messages WHERE conversation_id = $1',
      [conversationId],
    );
    expect(parseInt(msgRows[0].cnt, 10)).toBe(1);

    const { rows: jobRows } = await pgPool.query(
      'SELECT count(*) as cnt FROM public.agent_jobs WHERE conversation_id = $1',
      [conversationId],
    );
    expect(parseInt(jobRows[0].cnt, 10)).toBe(1);

    const { rows: corrRows } = await pgPool.query(
      'SELECT correlation_id FROM public.agent_jobs WHERE conversation_id = $1',
      [conversationId],
    );
    const expectedCorrelationId =
      res1.status === 201 ? knownRequestId : secondRequestId;
    expect(corrRows[0].correlation_id).toBe(expectedCorrelationId);
  }, 30000);
});
