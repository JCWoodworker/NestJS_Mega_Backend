import { SetMetadata } from '@nestjs/common';
import 'dotenv/config';

export const SKIP_AUTH_KEY = process.env.AUTHORIZATION_SKIP_AUTH_KEY;
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
