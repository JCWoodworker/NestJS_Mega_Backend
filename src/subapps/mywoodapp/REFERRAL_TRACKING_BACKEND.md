# Referral Tracking Backend Setup

This document describes how to set up the backend API to receive and store referral tracking data from the Woodworker's Companion web app.

## Overview

When users visit the web app via a referral link (e.g., `mywoodapp.com/colin`), the frontend will send a POST request to track the referral source before redirecting to the landing page.

## API Endpoint

### Request

```
POST /referrals
Content-Type: application/json
```

**Request Body:**
```json
{
  "source": "colin",
  "timestamp": "2026-01-25T12:34:56.789Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | The referrer identifier from the URL path |
| `timestamp` | string (ISO 8601) | When the referral occurred (client-side) |

### Response

**Success (201 Created):**
```json
{
  "id": 1,
  "source": "colin",
  "timestamp": "2026-01-25T12:34:56.789Z",
  "createdAt": "2026-01-25T12:34:57.000Z"
}
```

**Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Source is required",
  "error": "Bad Request"
}
```

---

## NestJS Implementation

### 1. Create the Entity

**`src/referrals/entities/referral.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  source: string;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;
}
```

### 2. Create the DTO

**`src/referrals/dto/create-referral.dto.ts`**

```typescript
import { IsString, IsNotEmpty, IsISO8601 } from 'class-validator';

export class CreateReferralDto {
  @IsString()
  @IsNotEmpty()
  source: string;

  @IsISO8601()
  timestamp: string;
}
```

### 3. Create the Service

**`src/referrals/referrals.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from './entities/referral.entity';
import { CreateReferralDto } from './dto/create-referral.dto';

@Injectable()
export class ReferralsService {
  constructor(
    @InjectRepository(Referral)
    private referralsRepository: Repository<Referral>,
  ) {}

  async create(
    createReferralDto: CreateReferralDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Referral> {
    const referral = this.referralsRepository.create({
      source: createReferralDto.source,
      timestamp: new Date(createReferralDto.timestamp),
      ipAddress,
      userAgent,
    });

    return this.referralsRepository.save(referral);
  }

  async findAll(): Promise<Referral[]> {
    return this.referralsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findBySource(source: string): Promise<Referral[]> {
    return this.referralsRepository.find({
      where: { source },
      order: { createdAt: 'DESC' },
    });
  }

  async getStats(): Promise<{ source: string; count: number }[]> {
    return this.referralsRepository
      .createQueryBuilder('referral')
      .select('referral.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .groupBy('referral.source')
      .orderBy('count', 'DESC')
      .getRawMany();
  }
}
```

### 4. Create the Controller

**`src/referrals/referrals.controller.ts`**

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/create-referral.dto';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createReferralDto: CreateReferralDto,
    @Req() request: Request,
  ) {
    const ipAddress =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip;
    const userAgent = request.headers['user-agent'];

    return this.referralsService.create(
      createReferralDto,
      ipAddress,
      userAgent,
    );
  }

  @Get()
  async findAll() {
    return this.referralsService.findAll();
  }

  @Get('stats')
  async getStats() {
    return this.referralsService.getStats();
  }

  @Get(':source')
  async findBySource(@Param('source') source: string) {
    return this.referralsService.findBySource(source);
  }
}
```

### 5. Create the Module

**`src/referrals/referrals.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { Referral } from './entities/referral.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Referral])],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
```

### 6. Register the Module

**`src/app.module.ts`**

```typescript
import { ReferralsModule } from './referrals/referrals.module';

@Module({
  imports: [
    // ... other imports
    ReferralsModule,
  ],
})
export class AppModule {}
```

---

## Database Migration

If using TypeORM migrations, create one for the referrals table:

```bash
npm run typeorm migration:generate -- -n CreateReferralsTable
```

Or manually create the table:

```sql
CREATE TABLE referrals (
  id SERIAL PRIMARY KEY,
  source VARCHAR(100) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX idx_referrals_source ON referrals(source);
CREATE INDEX idx_referrals_created_at ON referrals(created_at);
```

---

## CORS Configuration

Ensure your NestJS app allows requests from the web app domain:

**`src/main.ts`**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: [
      'https://mywoodapp.com',
      'https://www.mywoodapp.com',
      'http://localhost:8081', // For local development
    ],
    methods: ['POST', 'GET'],
    credentials: true,
  });

  await app.listen(3000);
}
```

---

## Frontend Integration

Once the backend is ready, update the frontend service at `src/services/referralService.ts`:

```typescript
import { REFERRAL_API_ENDPOINT } from '@/src/config/referrals';

export const trackReferral = async (source: string): Promise<void> => {
  console.log(`[Referral Tracking] Referrer: ${source}`);

  try {
    await fetch(REFERRAL_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('[Referral Tracking] Failed to send referral:', error);
  }
};
```

And update the endpoint in `src/config/referrals.ts`:

```typescript
export const REFERRAL_API_ENDPOINT = 'https://api.mywoodapp.com/referrals';
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/referrals` | Track a new referral |
| GET | `/referrals` | List all referrals (admin) |
| GET | `/referrals/stats` | Get referral counts by source (admin) |
| GET | `/referrals/:source` | Get referrals for a specific source (admin) |

---

## Optional Enhancements

1. **Rate limiting** - Prevent spam by limiting requests per IP
2. **Validation** - Only accept known referral sources from a whitelist
3. **Deduplication** - Prevent duplicate tracking (e.g., by IP + source within 24h)
4. **Analytics dashboard** - Build an admin UI to view referral stats
5. **Webhook notifications** - Alert when new referrals come in
