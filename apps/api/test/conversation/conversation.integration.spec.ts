import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { resolve } from 'path';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap/app.factory';
import {
  canonicalSupabaseUrl,
  useSupabaseTestEnvironment,
} from '../helpers/local-supabase-env';

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = canonicalSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const DIRECT_DATABASE_URL =
  process.env.DIRECT_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Conversation CRUD Integration', () => {
  let app: INestApplication;
  let pgPool: Pool;
  let restoreSupabaseEnvironment: (() => void) | undefined;
  const authUserIds = new Set<string>();

  beforeAll(async () => {
    restoreSupabaseEnvironment = useSupabaseTestEnvironment(SUPABASE_URL);
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
    restoreSupabaseEnvironment?.();
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

  async function deleteAuthUser(userId: string) {
    await pgPool.query('DELETE FROM auth.users WHERE id = $1', [userId]);
  }

  function testEmail(prefix: string): string {
    return `${prefix}-${randomUUID()}@example.test`;
  }

  it('isolates user data — user B cannot access user A conversation', async () => {
    const userA = await signUp(testEmail('user-a-int'));
    const userB = await signUp(testEmail('user-b-int'));

    const createRes = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'A Conversation' });
    const convId = createRes.body.id;

    await request(app.getHttpServer())
      .get(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'Hacked' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

  }, 30000);

  it('full CRUD lifecycle for owned conversation', async () => {
    const user = await signUp(testEmail('crud-int'));

    const createRes = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'My Chat' })
      .expect(201);
    const convId = createRes.body.id;

    const readRes = await request(app.getHttpServer())
      .get(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(readRes.body.id).toBe(convId);

    const updateRes = await request(app.getHttpServer())
      .patch(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Renamed' })
      .expect(200);
    expect(updateRes.body.title).toBe('Renamed');

    await request(app.getHttpServer())
      .delete(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);

  }, 30000);

  it('conversation pagination with cursor', async () => {
    const user = await signUp(testEmail('pagination-int'));

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ title: `Chat ${i}` });
    }

    const page1 = await request(app.getHttpServer())
      .get('/v1/conversations?limit=2')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.page.nextCursor).toBeDefined();

    const page2 = await request(app.getHttpServer())
      .get(
        `/v1/conversations?limit=2&cursor=${encodeURIComponent(page1.body.page.nextCursor)}`,
      )
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.page.nextCursor).toBeNull();

  }, 30000);
});
