import { createApp } from './bootstrap/app.factory';

async function bootstrap() {
  const app = await createApp();

  const server = app.getHttpServer();
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  await app.listen(3001);
}
bootstrap();
