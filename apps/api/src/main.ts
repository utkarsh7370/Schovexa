import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { initSentry } from './monitoring/sentry';

// Must run before anything else so Sentry's instrumentation can hook
// into modules (http, etc.) as they're first required.
initSentry();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy / load balancer the client's address is in
  // X-Forwarded-For. Rate limits, login lockout and the audit log all key on
  // it, so say how many proxies to trust (TRUST_PROXY=1 behind one) — never
  // 'true', which would let any client forge its own address.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  app.disable('x-powered-by');

  app.use(cookieParser());

  // CORS: explicit allow-list only, never a wildcard, because session
  // cookies are sent with credentials — see docs/architecture.md CORS note.
  const allowedOrigins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
