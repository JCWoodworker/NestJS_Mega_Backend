import { SetMetadata } from '@nestjs/common';

// This is circumventing the usual NestJS configService
// until I can figure out how to use it outside of a class properly
import * as dotenv from 'dotenv';
dotenv.config();

export const SKIP_AUTH_KEY = process.env.SKIP_AUTH_SECRET;

export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
