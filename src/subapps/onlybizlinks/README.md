# OnlyBizLinks

A Linktree-style platform for businesses, accessible via NFC chip interactions embedded in beer flight paddles.

**Website:** [www.onlybizlinks.com](https://www.onlybizlinks.com)

## Overview

OnlyBizLinks is a business link aggregation platform that allows customers to access a business's digital presence by tapping their phones to NFC chips embedded in beer flight paddles. Each business gets a custom domain page displaying their social media links, website, and other digital touchpoints.

## API Endpoints

All endpoints are prefixed with `/subapps/onlybizlinks/` as defined in `app.module.ts`.

### Business Management

- **GET** `/subapps/onlybizlinks/:incomingDomain` - Get business data by domain (public)
- **GET** `/subapps/onlybizlinks/all_businesses` - List all businesses (public)
- **POST** `/subapps/onlybizlinks/add_business` - Create new business (requires auth)

### Link Management

- **POST** `/subapps/onlybizlinks/add_custom_link` - Add custom link to business (requires auth)
- **POST** `/subapps/onlybizlinks/add_social_link` - Add social media link to business (requires auth)

### User Association

- **POST** `/subapps/onlybizlinks/add_user_and_business` - Associate user with business (requires auth)

## Architecture

### Entities

#### OblBusinesses

The core business entity containing:

- `id`: Primary key
- `name`: Business name (unique)
- `domain`: Custom domain slug (unique)
- `logo`: Optional logo URL
- **Relationships**: One-to-many with custom links, social links, and user associations

#### OblCustomLinks

Custom links for businesses:

- `id`: Primary key
- `business_id`: Foreign key to businesses
- `title`: Link display name
- `url`: Target URL
- **Relationship**: Many-to-one with businesses

#### OblSocialLinks

Social media links with platform validation:

- `id`: Primary key
- `business_id`: Foreign key to businesses
- `social_media_platform`: Enum (Facebook, Instagram, LinkedIn, Pinterest, X, YouTube)
- `url`: Social media URL
- `is_active`: Toggle for link visibility
- **Relationship**: Many-to-one with businesses

#### OblUsersAndBusinesses

Junction table for user-business associations:

- `id`: Primary key
- `business_id`: Foreign key to businesses
- `user_id`: Foreign key to users
- **Relationships**: Many-to-one with both businesses and users

### Data Transfer Objects (DTOs)

#### CreateBusinessDto

```typescript
{
  name: string;        // Business name
  logo?: string;       // Optional logo URL
  domain: string;      // Custom domain slug
}
```

#### CreateCustomLinkDto

```typescript
{
  title: string;       // Link display name
  url: string;         // Target URL
  business_id: number; // Associated business
}
```

#### CreateSocialLinkDto

```typescript
{
  business_id: number;                    // Associated business
  url: string;                           // Social media URL
  social_media_platform: SocialMediaPlatform; // Platform enum
  is_active?: boolean;                   // Optional visibility toggle
}
```

#### CreateUserAndBusinessDto

```typescript
{
  business_id: number; // Associated business
  user_id: string;     // Associated user
}
```

### Database Migrations

The migrations establish the database schema in this order:

1. **CreateBusinessesTable** (1728699473766) - Core businesses table
2. **CreateCustomLinksTable** (1728831619665) - Custom links with business foreign key
3. **CreateSocialLinksTable** (1728839370660) - Social links with business foreign key
4. **CreateUsersAndBusinessesTable** (1731968365131) - Junction table for user-business relationships

## How It Works

1. **Business Setup**: Businesses are created with a unique domain slug
2. **Link Configuration**: Custom and social links are added to each business
3. **NFC Integration**: Each business gets an NFC chip programmed with their domain
4. **Customer Interaction**: When customers tap their phone to the NFC chip, they're directed to the business's OnlyBizLinks page
5. **Link Display**: The page displays all active links for easy access to the business's digital presence

## Key Features

- **Domain-based routing**: Each business gets a unique subdomain/path
- **Social media integration**: Support for major platforms with validation
- **User management**: Association between platform users and businesses
- **Link management**: Custom links alongside social media profiles
- **NFC accessibility**: Seamless mobile access via NFC technology

## Security

- Public access for business data retrieval (NFC interaction)
- Authentication required for all administrative operations
- Input validation on all DTOs using class-validator
- Unique constraints on business names and domains
