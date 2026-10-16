import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { uploadDir } from './uploads/upload-dir.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a hosting load balancer (Render) every request would otherwise appear to come from the
  // proxy, so the login rate limit would be shared by everyone. Set TRUST_PROXY_HOPS to the number
  // of proxies in front of this server; 0 (the default) trusts none, as when running locally.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Uploaded product images, e.g. /uploads/products/<uuid>.jpg
  app.useStaticAssets(uploadDir(), {
    prefix: '/uploads/',
    index: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
