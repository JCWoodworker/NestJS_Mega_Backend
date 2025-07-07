# Subapps Module

The **Subapps Module** serves as a centralized hub for organizing and managing multiple independent applications within the NestJS mega backend. This architectural pattern allows for clean separation of concerns while maintaining a unified entry point.

## Architecture Overview

### Centralized Organization

The subapps module acts as a single import point for all subapplications, keeping the main `app.module.ts` clean and organized. Instead of importing each subapp individually, you only need to import the `SubappsModule`.

### Routing Structure

All subapps are accessible under the `/subapps/` path prefix, with each subapp having its own namespace:

- `/subapps/mycuttingboard/...`
- `/subapps/onlybizlinks/...`
- `/subapps/ironview/...`

This is configured in `app.module.ts` using NestJS's `RouterModule` with nested routing:

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

### Shared Services

The subapps module provides shared functionality across all subapps:

- **Image Upload Service**: S3 bucket integration for file uploads
- **Authentication**: Centralized auth configuration
- **Common utilities**: Shared between subapps

## Current Subapps

### 1. MyCuttingBoard (`/subapps/mycuttingboard/`)

**Purpose**: Custom cutting board and coaster e-commerce platform

**Key Features**:

- Custom cutting board and coaster product creation
- Wood type selection and management (hardness, region, descriptions)
- User-product associations
- Link management system for marketing/sharing
- Admin dashboard for product and user management
- Product-wood relationship tracking

**Main Entities**:

- `CbcProduct`: Custom cutting boards and coasters
- `MycuttingboardWoods`: Wood types with specifications
- `CbcLinks`: User-managed links
- `CbcUserAndProduct`: User-product associations
- `CbcProductAndWoods`: Product-wood relationships

**Controllers**:

- Main controller with test endpoints
- Woods controller for wood type management
- Product controller for product operations
- Links controller for link management
- Admin controller for administrative functions

### 2. OnlyBizLinks (`/subapps/onlybizlinks/`)

**Purpose**: Linktree-style platform for businesses, accessible via NFC chip interactions

**Key Features**:

- Business link aggregation (social media, websites, custom links)
- NFC chip integration for contactless access
- Domain-based business profiles
- Social media platform validation
- Custom link management
- User-business associations

**Main Entities**:

- `OblBusinesses`: Business profiles with unique domains
- `OblCustomLinks`: Custom business links
- `OblSocialLinks`: Social media links with platform validation
- `OblUsersAndBusinesses`: User-business relationships

**Access Method**: Customers tap NFC chips (embedded in beer flight paddles) to access business link pages

### 3. IronView (`/subapps/ironview/`)

**Purpose**: Construction and renovation management system

**Key Features**:

- Hierarchical building structure management
- Construction progress tracking
- Wall documentation with NFC/QR code identification
- Progress photography by construction stage
- Building, floor, area, and room organization
- Construction timeline documentation

**Main Entities**:

- `Building`: Properties with addresses and construction dates
- `Floor`: Building floors with blueprints
- `Area`: Sections within floors (apartments, offices, etc.)
- `AreaType`: Predefined area classifications
- `Room`: Rooms within areas (living room, bedroom, etc.)
- `Wall`: Individual walls with NFC/QR identification
- `WallImage`: Progress photos organized by construction stage

**Construction Stages Tracked**:

- Framing
- Electrical rough-in
- Plumbing rough-in
- Drywall
- Painting
- Finishing
- Other custom stages

## Adding New Subapps

To add a new subapp:

1. **Create the subapp module** in `/src/subapps/newapp/`
2. **Add to SubappsModule** imports in `subapps.module.ts`
3. **Configure routing** in `app.module.ts` RouterModule children
4. **Follow the pattern**: Each subapp should have its own controllers, services, entities, DTOs, and migrations

## Benefits of This Architecture

- **Scalability**: Easy to add new subapps without cluttering the main module
- **Separation of Concerns**: Each subapp is self-contained
- **Shared Resources**: Common functionality (auth, file uploads) shared across subapps
- **Clean Routing**: Predictable URL structure for all subapps
- **Maintainability**: Clear organization makes the codebase easier to maintain

## TODO Items

### User Management & Access Control

- [ ] Centralize user subscription tiers and access control
- [ ] Determine whether to keep roles in users table or create subapp-specific roles
- [ ] Decide on unified vs. subapp-specific subscription tiers
- [ ] Consider implementing a unified authentication page for all subapps

### Future Enhancements

- [ ] Implement shared middleware for common functionality
- [ ] Add subapp-specific analytics and monitoring
- [ ] Create shared component library for common UI elements
- [ ] Implement cross-subapp user data synchronization
