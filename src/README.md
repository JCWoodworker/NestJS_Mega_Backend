# NestJS Mega Backend

A comprehensive, enterprise-grade NestJS backend architecture featuring multiple subapplications, robust authentication & authorization, AI integration, web scraping capabilities, and scalable database management.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Modules](#core-modules)
3. [Identity & Access Management (IAM)](#identity--access-management-iam)
4. [Subapps Architecture](#subapps-architecture)
5. [Database Architecture](#database-architecture)
6. [Security & Guards](#security--guards)
7. [Validation & Pipes](#validation--pipes)
8. [Configuration Management](#configuration-management)
9. [AI Integration](#ai-integration)
10. [Web Scraping](#web-scraping)
11. [Package Management](#package-management)
12. [Development Workflow](#development-workflow)
13. [Testing Strategy](#testing-strategy)
14. [Deployment](#deployment)
15. [API Documentation](#api-documentation)

## Architecture Overview

### Technology Stack

- **Framework**: NestJS 10.x (Node.js 20.x)
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT with refresh tokens + Google OAuth
- **Package Manager**: Yarn 4.x
- **Validation**: class-validator + class-transformer
- **Security**: Bcrypt hashing, role-based access control
- **File Storage**: AWS S3 integration
- **Web Scraping**: Playwright with Chromium
- **AI Integration**: Google Gemini (placeholder)
- **Rate Limiting**: @nestjs/throttler
- **View Engine**: Handlebars (HBS)

### Project Structure

```
src/
├── app.module.ts              # Root application module
├── main.ts                    # Application bootstrap
├── config/                    # Configuration files
│   ├── app.config.ts         # App-wide configuration
│   └── auth.config.ts        # Authentication configuration
├── iam/                       # Identity & Access Management
│   ├── authentication/       # Auth services & controllers
│   ├── authorization/        # Role-based access control
│   ├── decorators/           # Custom decorators
│   ├── guards/               # Security guards
│   └── hashing/              # Password hashing services
├── subapps/                   # Modular subapplications
│   ├── mycuttingboard/       # E-commerce platform
│   ├── onlybizlinks/         # Business link aggregation
│   └── ironview/             # Construction management
├── users/                     # User management module
├── gemini/                    # AI integration module
├── scrapers/                  # Web scraping module
├── utils/                     # Shared utilities
├── views/                     # Handlebars templates
└── public/                    # Static assets
```

## Core Modules

### App Module (`app.module.ts`)

The root module orchestrates the entire application architecture:

```typescript
@Module({
  imports: [
    // Environment configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig],
      validationSchema: Joi.object({
        ENVIRONMENT: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
      }),
    }),
    
    // Database connection
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        autoLoadEntities: true,
      }),
    }),
    
    // Modular routing structure
    RouterModule.register([...]),
    
    // Rate limiting
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 10 }],
    }),
  ],
  providers: [
    // Global guards
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
```

### Main Application Setup (`main.ts`)

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Global prefix for all routes
  app.setGlobalPrefix('api/v1');
  
  // Global validation pipe with transformation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  
  // CORS configuration
  app.enableCors({
    allowedHeaders: 'Content-Type, Accept, Authorization',
    origin: allowedOrigins,
    methods: 'GET,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  // View engine setup
  app.setViewEngine('hbs');
}
```

## Identity & Access Management (IAM)

### Authentication Architecture

The IAM system provides comprehensive authentication and authorization:

#### Core Components

1. **AuthenticationService**: Handles user registration, login, token generation
2. **AccessTokenGuard**: JWT token validation
3. **AuthenticationGuard**: Multi-type auth support
4. **RolesGuard**: Role-based access control
5. **RefreshTokensService**: Token refresh management
6. **GoogleAuthenticationService**: OAuth integration

#### Authentication Flow

```typescript
// Sign-in process
async signIn(signInDto: SignInDto) {
  // 1. Validate user credentials
  // 2. Generate access & refresh tokens
  // 3. Check business associations (OnlyBizLinks integration)
  // 4. Return authentication data + business context
}

// Token generation
async generateTokens(user: Users) {
  const [accessToken, refreshToken] = await Promise.all([
    this.signToken(user.id, this.jwtConfiguration.accessTokenTtl, {
      email: user.email, 
      role: user.role 
    }),
    this.signToken(user.id, this.jwtConfiguration.refreshTokenTtl, {
      refreshTokenId 
    }),
  ]);
}
```

#### JWT Configuration

```typescript
// jwt.config.ts
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  audience: process.env.JWT_TOKEN_AUDIENCE,
  issuer: process.env.JWT_TOKEN_ISSUER,
  accessTokenTtl: parseInt(process.env.JWT_ACCESS_TOKEN_TTL) || 3600,
  refreshTokenTtl: parseInt(process.env.JWT_REFRESH_TOKEN_TTL) || 86400,
}));
```

### Authorization System

#### Role-Based Access Control

```typescript
// Role enumeration
export enum Role {
  Basic = 'basic',
  Admin = 'admin',
}

// Role decorator usage
@Roles(Role.Admin)
@Controller('admin')
export class AdminController { ... }

// Authentication type control
@Auth(AuthType.Bearer)  // Requires JWT
@Auth(AuthType.None)    // Public endpoint
```

#### Custom Decorators

```typescript
// Active user data extraction
@Get('profile')
getProfile(@ActiveUser() user: ActiveUserData) {
  return user;
}

// Specific field extraction
@Get('email')
getEmail(@ActiveUser('email') email: string) {
  return email;
}
```

### Google OAuth Integration

```typescript
@Injectable()
export class GoogleAuthenticationService {
  async authenticate(token: string) {
    const loginTicket = await this.oauthClient.verifyIdToken({
      idToken: token,
    });
    
    const { email, sub: googleId, given_name, family_name, picture } = 
      loginTicket.getPayload();
    
    // Create or authenticate existing user
    // Return tokens and user data
  }
}
```

## Subapps Architecture

### Centralized Subapp Management

The subapps module serves as a unified hub for multiple independent applications:

#### Router Configuration

```typescript
RouterModule.register([
  {
    path: 'subapps',
    module: SubappsModule,
    children: [
      { path: 'mycuttingboard', module: MycuttingboardModule },
      { path: 'onlybizlinks', module: OnlyBizlinksModule },
      { path: 'ironview', module: IronviewModule },
    ],
  },
])
```

### Current Subapplications

#### 1. MyCuttingBoard (`/api/v1/subapps/mycuttingboard/`)

**E-commerce platform for custom cutting boards and coasters**

- **Entities**: Products, Woods, Links, User-Product associations
- **Features**: Product customization, wood selection, admin dashboard
- **Controllers**: Main, Product, Links, Woods, Admin
- **Authentication**: Role-based admin functions

#### 2. OnlyBizLinks (`/api/v1/subapps/onlybizlinks/`)

**Business link aggregation platform with NFC integration**

- **Entities**: Businesses, Custom Links, Social Links, User-Business associations
- **Features**: Domain-based profiles, social media integration, NFC access
- **Access Method**: NFC chips in beer flight paddles
- **Public Endpoints**: Business data retrieval for NFC interaction

#### 3. IronView (`/api/v1/subapps/ironview/`)

**Construction and renovation management system**

- **Entities**: Buildings, Floors, Areas, Rooms, Walls, Wall Images
- **Features**: Hierarchical building structure, progress tracking, NFC/QR identification
- **Use Cases**: Construction documentation, progress photography

### Shared Subapp Services

```typescript
// Image upload service (S3 integration)
@Post('image-upload')
@UseInterceptors(FileInterceptor('image'))
async imageUpload(@UploadedFile() file: Express.Multer.File) {
  // Upload to AWS S3
  // Return public URL
}
```

## Database Architecture

### TypeORM Configuration

#### Database Connection

```typescript
// Async configuration
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    autoLoadEntities: true,
  }),
})

// CLI configuration (typeorm-cli.config.ts)
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['dist/src/**/*.entity.js'],
  migrations: ['dist/src/**/*.migration.js'],
});
```

### Entity Relationships

#### Core User Entity

```typescript
@Entity()
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ enum: Role, default: Role.Basic })
  role: Role;

  @Column({ nullable: true })
  googleId: string;

  // Profile information
  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column({ nullable: true })
  image_url: string;

  // Relationship with OnlyBizLinks
  @OneToMany(() => OblUsersAndBusinesses, (uab) => uab.user)
  usersAndBusinesses: OblUsersAndBusinesses[];
}
```

#### Entity Features

- **UUID Primary Keys**: Used for sensitive entities (Users, Buildings, etc.)
- **Serial Primary Keys**: Used for business entities (Products, Links, etc.)
- **Soft Deletes**: Implemented where data retention is important
- **Timestamps**: Automatic created_at and updated_at columns
- **Relationships**: Proper foreign key constraints and cascade rules

### Migration Management

#### Migration Commands

```bash
# Run pending migrations
yarn migrate:run

# Revert last migration
yarn migrate:revert

# Generate new migration
npx typeorm migration:generate -d dist/typeorm-cli.config
```

#### Migration Examples

```typescript
// Creating a table with relationships
export class CreateBusinessesTable implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "obl_businesses" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "name" character varying NOT NULL,
        "logo" character varying,
        "domain" character varying UNIQUE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
  }
}
```

## Security & Guards

### Multi-Layer Security Architecture

#### Guard Hierarchy

1. **ThrottlerGuard**: Rate limiting protection
2. **AuthenticationGuard**: Token validation
3. **RolesGuard**: Role-based authorization
4. **Custom Guards**: Module-specific security

#### Guard Implementation

```typescript
// Authentication Guard with multiple auth types
@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly authTypeGuardMap: Record<AuthType, CanActivate> = {
    [AuthType.Bearer]: this.accessTokenGuard,
    [AuthType.None]: { canActivate: () => true },
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authTypes = this.reflector.getAllAndOverride<AuthType[]>(
      AUTH_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [AuthenticationGuard.defaultAuthType];
    
    // Try each auth type until one succeeds
    for (const guard of guards) {
      if (await guard.canActivate(context)) return true;
    }
    throw new UnauthorizedException();
  }
}
```

#### Access Token Guard

```typescript
@Injectable()
export class AccessTokenGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) throw new UnauthorizedException();
    
    try {
      const payload = await this.jwtService.verifyAsync(token, this.jwtConfiguration);
      request[REQUEST_USER_KEY] = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

### Security Features

- **Password Hashing**: Bcrypt with configurable salt rounds
- **JWT Security**: Signed tokens with audience and issuer validation
- **Refresh Token Management**: Secure token rotation
- **CORS Protection**: Environment-specific origin validation
- **Rate Limiting**: Configurable request throttling
- **Input Sanitization**: Automatic whitelist validation

## Validation & Pipes

### Global Validation Configuration

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,                    // Strip unknown properties
  forbidNonWhitelisted: true,         // Reject unknown properties
  transform: true,                    // Auto-transform types
  transformOptions: {
    enableImplicitConversion: true,   // Convert strings to numbers/booleans
  },
}));
```

### DTO Validation Patterns

#### Comprehensive Validation Examples

```typescript
// Building creation DTO
export class CreateBuildingDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsPostalCode('US')
  @MaxLength(20)
  zip_code?: string;

  @IsOptional()
  @IsDateString()
  construction_date?: string;
}

// Wall creation with numeric validation
export class CreateWallDto {
  @IsUUID()
  @IsNotEmpty()
  room_id: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approx_length_ft?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nfc_tag_id?: string;
}

// Authentication DTOs
export class SignUpDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(AuthActionType)
  signUpOrIn: string;
}
```

#### Validation Decorators Used

- **Type Validation**: `@IsString()`, `@IsNumber()`, `@IsBoolean()`
- **Format Validation**: `@IsEmail()`, `@IsUrl()`, `@IsUUID()`, `@IsDateString()`
- **Content Validation**: `@IsEnum()`, `@IsPostalCode()`, `@IsStrongPassword()`
- **Length Validation**: `@MinLength()`, `@MaxLength()`, `@Min()`, `@Max()`
- **Conditional Validation**: `@IsOptional()`, `@IsNotEmpty()`

### Update DTO Patterns

```typescript
// Partial update DTOs using mapped types
export class UpdateBuildingDto extends PartialType(CreateBuildingDto) {}

// Custom update DTOs with additional constraints
export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @IsOptional()
  @IsUUID()
  floor_id?: string;  // Usually not changed in updates
}
```

## Configuration Management

### Environment Configuration

#### Centralized Config Structure

```typescript
// app.config.ts
export default registerAs('app', () => ({
  environment: process.env.ENVIRONMENT,
  database: {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    autoLoadEntities: true,
  },
}));

// auth.config.ts
export default registerAs('auth', () => ({
  saltRounds: +process.env.SALT_ROUNDS || 10,
}));

// jwt.config.ts
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  audience: process.env.JWT_TOKEN_AUDIENCE,
  issuer: process.env.JWT_TOKEN_ISSUER,
  accessTokenTtl: parseWithDefault(process.env.JWT_ACCESS_TOKEN_TTL, 3600),
  refreshTokenTtl: parseWithDefault(process.env.JWT_REFRESH_TOKEN_TTL, 86400),
}));
```

#### Environment Validation

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  load: [appConfig, authConfig],
  validationSchema: Joi.object({
    ENVIRONMENT: Joi.string().required(),
    DATABASE_URL: Joi.string().required(),
    JWT_SECRET: Joi.string().required(),
    JWT_TOKEN_AUDIENCE: Joi.string().required(),
    JWT_TOKEN_ISSUER: Joi.string().required(),
  }),
})
```

### Configuration Usage

```typescript
// Injecting configuration
constructor(
  @Inject(jwtConfig.KEY)
  private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
) {}

// Feature-specific configuration
@Module({
  imports: [ConfigModule.forFeature(jwtConfig)],
})
```

## AI Integration

### Gemini Module

Currently a placeholder module for AI integration:

```typescript
@Injectable()
export class GeminiService {
  async sendGeminiPrompt(prompt: string) {
    // Placeholder for Google Gemini AI integration
    return `AI response to: "${prompt}"`;
  }
}

// Controller endpoint
@Post('send-gemini-prompt')
async sendGeminiPrompt(@Body() body: CreateGeminiPromptDto) {
  return this.geminiService.sendGeminiPrompt(body.prompt);
}
```

**Route**: `/api/v1/ai/send-gemini-prompt`

## Web Scraping

### Scrapers Module

Provides web scraping capabilities using Playwright:

#### Hacker News Scraper

```typescript
export async function scrapeHackerNews(): Promise<{
  articles: HackerNewsArticle[];
  isSorted: boolean;
}> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Scrape newest articles
  // Format timestamps
  // Verify sorting
  // Return structured data
}
```

#### Features

- **Playwright Integration**: Chromium browser automation
- **Rate Limiting**: 30 requests per minute
- **Error Handling**: Comprehensive error management
- **Data Formatting**: Structured article data with timestamps
- **Pagination**: Multi-page scraping support

**Route**: `/api/v1/scrapers/hacker-news-scraper`

## Package Management

### Core Dependencies

#### NestJS Ecosystem

```json
{
  "@nestjs/common": "^10.2.8",
  "@nestjs/core": "^10.3.0",
  "@nestjs/config": "^3.1.1",
  "@nestjs/typeorm": "^10.0.0",
  "@nestjs/jwt": "^10.2.0",
  "@nestjs/throttler": "^6.4.0",
  "@nestjs/devtools-integration": "^0.1.6"
}
```

#### Database & ORM

```json
{
  "typeorm": "^0.3.17",
  "pg": "^8.11.3"
}
```

#### Security & Validation

```json
{
  "class-validator": "^0.14.0",
  "class-transformer": "^0.5.1",
  "bcrypt": "^5.1.1",
  "@hapi/joi": "^17.1.1"
}
```

#### External Integrations

```json
{
  "@aws-sdk/client-s3": "^3.498.0",
  "google-auth-library": "^9.4.1",
  "playwright": "^1.51.1",
  "axios": "^1.6.2"
}
```

### Development Dependencies

```json
{
  "@nestjs/testing": "^10.2.8",
  "jest": "^29.7.0",
  "supertest": "^6.3.3",
  "ts-jest": "^29.1.1",
  "eslint": "^8.53.0",
  "prettier": "^3.1.0"
}
```

### Scripts

```json
{
  "start:dev": "nest start --watch",
  "start:prod": "node dist/src/main",
  "build": "nest build",
  "test": "jest",
  "test:e2e": "jest --config ./test/jest-e2e.json",
  "migrate:run": "typeorm migration:run -d dist/typeorm-cli.config",
  "migrate:revert": "typeorm migration:revert -d dist/typeorm-cli.config",
  "seed:users": "ts-node ./src/seeders/users.seed.ts"
}
```

## Development Workflow

### Local Development Setup

```bash
# Install dependencies
yarn install

# Environment setup
cp .env.example .env
# Configure environment variables

# Database setup
# Create PostgreSQL database
# Run migrations
yarn migrate:run

# Start development server
yarn start:dev
```

### Path Mapping

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@app/*": ["./app/*"],
      "@users/*": ["./users/*"],
      "@config/*": ["./config/*"],
      "@iam/*": ["./iam/*"],
      "@gemini/*": ["./gemini/*"],
      "@subapps/*": ["./subapps/*"],
      "@onlybizlinks/*": ["./subapps/onlybizlinks/*"],
      "@mycuttingboard/*": ["./subapps/mycuttingboard/*"],
      "@scrapers/*": ["./scrapers/*"],
      "@utils/*": ["./utils/*"]
    }
  }
}
```

### Code Quality

```json
// ESLint + Prettier configuration
{
  "extends": ["@nestjs", "prettier"],
  "rules": {
    "import/order": ["error", { "alphabetize": { "order": "asc" } }]
  }
}
```

## Testing Strategy

### Test Configuration

```json
// jest configuration
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "collectCoverageFrom": [
    "**/*.(t|j)s",
    "!**/*.dto.ts",
    "!**/*.enum.ts", 
    "!**/*.migration.ts",
    "!**/entities/**",
    "!main.ts"
  ],
  "moduleNameMapper": {
    "^@app/(.*)$": "<rootDir>/app/$1",
    "^@users/(.*)$": "<rootDir>/users/$1"
    // ... path mappings
  }
}
```

### Test Types

#### Unit Tests

```typescript
describe('AuthenticationService', () => {
  let service: AuthenticationService;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        { provide: HashingService, useValue: mockHashingService },
      ],
    }).compile();
    
    service = module.get<AuthenticationService>(AuthenticationService);
  });
  
  it('should generate valid tokens', async () => {
    const tokens = await service.generateTokens(mockUser);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });
});
```

#### Integration Tests

```typescript
describe('AppModule (e2e)', () => {
  let app: INestApplication;
  
  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
  });
  
  it('/authentication/sign-in (POST)', () => {
    return request(app.getHttpServer())
      .post('/authentication/sign-in')
      .send(signInDto)
      .expect(201);
  });
});
```

### Test Commands

```bash
# Unit tests
yarn test

# Watch mode
yarn test:watch

# Coverage report
yarn test:cov

# E2E tests
yarn test:e2e

# Debug mode
yarn test:debug
```

## Deployment

### Production Configuration

#### Environment Variables

```bash
# Required environment variables
ENVIRONMENT=production
DATABASE_URL=postgresql://user:password@host:port/database

# JWT Configuration
JWT_SECRET=your-super-secret-key
JWT_TOKEN_AUDIENCE=your-app
JWT_TOKEN_ISSUER=your-app
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=86400

# Google OAuth
GOOGLE_CLIENT_ID_CBC=your-google-client-id
GOOGLE_CLIENT_SECRET_CBC=your-google-client-secret

# AWS S3
AWS_ACCESS_KEY=your-aws-access-key
AWS_SECRET_KEY=your-aws-secret-key
AWS_REGION=your-aws-region
AWS_S3_BUCKET_NAME=your-bucket-name

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
```

#### Build Process

```bash
# Production build
yarn build

# Start production server
yarn start:prod
```

#### Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build
EXPOSE 3000
CMD ["node", "dist/src/main"]
```

### Heroku Deployment

```json
// Procfile
web: node dist/src/main

// package.json engines
{
  "engines": {
    "node": "20.x",
    "yarn": "4.x"
  }
}
```

## API Documentation

### Base URL Structure

All API endpoints are prefixed with `/api/v1/`

### Authentication Endpoints

```
POST   /api/v1/authentication/sign-up
POST   /api/v1/authentication/sign-in
POST   /api/v1/authentication/refresh-tokens
POST   /api/v1/authentication/google
```

### User Management

```
GET    /api/v1/users/profile
PATCH  /api/v1/users/profile
DELETE /api/v1/users/profile
```

### Subapp Endpoints

#### MyCuttingBoard

```
GET    /api/v1/subapps/mycuttingboard/test-message
GET    /api/v1/subapps/mycuttingboard/product/all
GET    /api/v1/subapps/mycuttingboard/product/:id
GET    /api/v1/subapps/mycuttingboard/links
POST   /api/v1/subapps/mycuttingboard/links
DELETE /api/v1/subapps/mycuttingboard/links/:id

# Admin endpoints (requires Admin role)
GET    /api/v1/subapps/mycuttingboard/admin/all-product-data
POST   /api/v1/subapps/mycuttingboard/admin/add-new-product
DELETE /api/v1/subapps/mycuttingboard/admin/delete-product/:id
```

#### OnlyBizLinks

```
GET    /api/v1/subapps/onlybizlinks/:domain        # Public
GET    /api/v1/subapps/onlybizlinks/all_businesses # Public
POST   /api/v1/subapps/onlybizlinks/add_business
POST   /api/v1/subapps/onlybizlinks/add_custom_link
POST   /api/v1/subapps/onlybizlinks/add_social_link
```

#### IronView

```
GET    /api/v1/subapps/ironview/buildings          # Public
GET    /api/v1/subapps/ironview/buildings/:id      # Public
```

### AI & Scraping

```
GET    /api/v1/ai/
POST   /api/v1/ai/send-gemini-prompt

GET    /api/v1/scrapers/hacker-news-scraper        # Rate limited
```

### Shared Services

```
POST   /api/v1/subapps/image-upload                # Admin only
```

### Response Formats

#### Success Response

```json
{
  "statusCode": 200,
  "data": { ... },
  "message": "Success"
}
```

#### Error Response

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

#### Authentication Response

```json
{
  "authData": {
    "userInfo": {
      "firstName": "John",
      "lastName": "Doe", 
      "imageUrl": "https://...",
      "role": "basic"
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ..."
    }
  },
  "businesses": [ ... ] // OnlyBizLinks integration
}
```

## Utility Functions

### Object Filtering

```typescript
// Filter sensitive user data
export function filterObject<T>(obj: T, allowedKeys: (keyof T)[]): Partial<T> {
  return Object.keys(obj)
    .filter((key) => allowedKeys.includes(key as keyof T))
    .reduce((filtered, key) => {
      filtered[key as keyof T] = obj[key as keyof T];
      return filtered;
    }, {} as Partial<T>);
}

// Usage example
const filteredUser = filterObject(user, [
  'id', 'email', 'role', 'first_name', 'last_name', 'image_url'
]);
```

## Performance Considerations

### Database Optimization

- **Connection Pooling**: PostgreSQL connection management
- **Query Optimization**: TypeORM query builder for complex queries
- **Indexes**: Strategic database indexing for frequently queried fields
- **Pagination**: Limit result sets for large data collections

### Caching Strategy

- **In-Memory Caching**: For frequently accessed configuration data
- **Database Query Caching**: TypeORM query result caching
- **CDN Integration**: Static asset delivery via AWS S3

### Rate Limiting

```typescript
// Global rate limiting
ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60000, limit: 10 }],
})

// Endpoint-specific rate limiting
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Get(':id')
findScraper(@Param('id') id: string) { ... }
```

## Security Best Practices

### Password Security

- **Bcrypt Hashing**: Configurable salt rounds
- **Strong Password Requirements**: Enforced via validation
- **Password Rotation**: Refresh token invalidation on password change

### Token Security

- **JWT Best Practices**: Short-lived access tokens, longer refresh tokens
- **Token Rotation**: Automatic refresh token rotation
- **Audience/Issuer Validation**: Prevents token reuse across applications

### Database Security

- **Parameterized Queries**: TypeORM prevents SQL injection
- **Connection Encryption**: SSL/TLS database connections
- **Least Privilege**: Role-based database access

### API Security

- **CORS Configuration**: Environment-specific origin validation
- **Input Validation**: Comprehensive DTO validation
- **Rate Limiting**: Request throttling and abuse prevention
- **Error Handling**: Secure error responses without sensitive data leakage

---

## Contributing

This comprehensive architecture provides a robust foundation for enterprise applications with multiple subapplications, secure authentication, and scalable database management. The modular design allows for easy extension and maintenance while following NestJS best practices.

For specific implementation details, refer to the individual module documentation within each directory.
