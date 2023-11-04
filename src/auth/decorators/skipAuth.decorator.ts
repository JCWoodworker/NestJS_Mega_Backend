import { SetMetadata } from '@nestjs/common';
// import 'dotenv/config';

export const SKIP_AUTH_KEY = process.env.SKIP_AUTH_ACCESS_SECRET;
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
