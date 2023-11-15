import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.use(cookieParser());

  // Set views engine with handlebars
  app.useStaticAssets('src/public');
  app.setBaseViewsDir('src/views');
  app.setViewEngine('hbs');

  // Remember to ensure that only specific origins can communicate with your API!!!
  app.enableCors({
    allowedHeaders: 'Content-Type, Accept',
    origin: '*',
    // Use the following in production (see variable declaration on line 10 above):
    // origin: allowedOrigins
    methods: 'GET,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(PORT);
}
bootstrap();
