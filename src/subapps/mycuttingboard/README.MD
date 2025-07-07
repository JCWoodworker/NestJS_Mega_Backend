# MyCuttingBoard

A custom cutting board and coaster e-commerce platform that allows users to create personalized woodworking products with custom wood selections, manage product links, and track user-product associations.

## Overview

MyCuttingBoard is a comprehensive e-commerce platform specialized in custom cutting boards and coasters. Users can create personalized products by selecting from various wood types, each with detailed specifications including hardness, region, and descriptions. The platform includes user management, product creation, link management for marketing, and administrative tools for managing the entire ecosystem.

## API Endpoints

All endpoints are prefixed with `/subapps/mycuttingboard/` as defined in `app.module.ts`.

### Main Application

- **GET** `/subapps/mycuttingboard/test-message` - Test endpoint (public)

### Product Management

- **GET** `/subapps/mycuttingboard/product/all` - Get all products (requires auth)
- **GET** `/subapps/mycuttingboard/product/:id` - Get product by ID (public)

### Link Management

- **GET** `/subapps/mycuttingboard/links` - Get user's links (requires auth)
- **POST** `/subapps/mycuttingboard/links` - Add new link (requires auth)
- **POST** `/subapps/mycuttingboard/links/:id` - Update link (requires auth)
- **DELETE** `/subapps/mycuttingboard/links/:id` - Delete link (requires auth)

### Wood Management

- **GET** `/subapps/mycuttingboard/woods` - Get woods test message (requires auth)

### Admin Functions (Admin Role Required)

#### Product Administration

- **GET** `/subapps/mycuttingboard/admin/all-product-data` - Get all product data
- **POST** `/subapps/mycuttingboard/admin/add-new-product` - Create new product
- **PATCH** `/subapps/mycuttingboard/admin/update-product/:id` - Update product
- **DELETE** `/subapps/mycuttingboard/admin/delete-product/:id` - Delete product

#### User Administration

- **GET** `/subapps/mycuttingboard/admin/all-users` - Get all users
- **DELETE** `/subapps/mycuttingboard/admin/delete-user/:userId` - Delete user

#### User-Product Association Management

- **GET** `/subapps/mycuttingboard/admin/user-and-product/single-user-product-list/:userId` - Get user-product associations
- **POST** `/subapps/mycuttingboard/admin/user-and-product/add` - Associate user with product
- **DELETE** `/subapps/mycuttingboard/admin/user-and-product/delete/:userId/:productId` - Remove user-product association

## Architecture

### Entities

#### CbcProduct

Core product entity for cutting boards and coasters:

- `id`: Primary key
- `user_id`: Associated user ID
- `type`: Product type enum (board, coaster)
- `title`: Product name
- `description`: Product description
- `customer_message`: Custom message for customer
- `image_url`: Product image URL
- `created_at`, `updated_at`: Timestamps

#### MycuttingboardWoods

Wood type specifications:

- `id`: Primary key
- `wood_name`: Wood species name
- `wood_description`: Detailed wood description
- `wood_region`: Geographic origin
- `wood_hardness`: Hardness classification
- `wood_image_url`: Wood sample image
- `created_at`, `updated_at`: Timestamps

#### CbcLinks

User-managed links for marketing/sharing:

- `id`: Primary key
- `user_id`: Link owner
- `title`: Link display name
- `url`: Target URL
- `notes`: Additional notes
- `created_at`, `updated_at`: Timestamps

#### CbcUserAndProduct

User-product association table:

- `id`: Primary key
- `user_id`: Associated user
- `product_id`: Associated product
- `created_at`, `updated_at`: Timestamps

#### CbcProductAndWoods

Product-wood relationship table:

- `id`: Primary key
- `product_id`: Associated product
- `wood_id`: Associated wood type
- `created_at`, `updated_at`: Timestamps

### Data Transfer Objects (DTOs)

#### CreateProductDto

```typescript
{
  type: CbcProductEnum;      // 'board' or 'coaster'
  title: string;             // Product name
  description?: string;      // Optional description
  customer_message?: string; // Optional custom message
  user_id?: string;          // Optional user association
  image_url?: string;        // Optional product image
}
```

#### CreateLinkDto

```typescript
{
  user_id: string;  // Link owner
  url: string;      // Target URL
  title: string;    // Link display name
  notes: string;    // Additional notes
}
```

#### CreateUserAndProductDto

```typescript
{
  user_id: string;      // User to associate
  product_id?: number;  // Product to associate
}
```

### Services Architecture

#### AdminService

- **Product Management**: CRUD operations for products
- **User Management**: User administration and filtering
- **User-Product Associations**: Managing relationships between users and products

#### ProductService

- **Product Retrieval**: Get all products or specific product by ID
- **Product Operations**: Add, update, delete products

#### LinksService

- **Link Management**: User-specific link CRUD operations
- **Permission Validation**: Ensures users can only modify their own links

#### WoodsService

- **Wood Type Management**: Currently basic functionality for wood specifications

### Database Migrations

Database schema established through these migrations:

1. **CreateWoodsTable** (1709143555371)
   - Creates `mycuttingboard_woods` table with wood specifications

2. **CreateProductsTable** (1717707898300)
   - Creates `cbc_product` table for cutting boards and coasters

3. **CreateProductsAndWoodsTable** (1718910694438)
   - Creates junction table for product-wood relationships

4. **CreateUserAndProductTable** (1719167960082)
   - Creates `cbc_user_and_product` association table

5. **CreateLinksTable** (1720838363157)
   - Creates `cbc_links` table for user marketing links

## Key Features

### Product Customization

- **Dual Product Types**: Support for both cutting boards and coasters
- **Wood Selection**: Multiple wood types with detailed specifications
- **Custom Messaging**: Personalized messages for customers
- **Image Integration**: Product visualization capabilities

### User Management

- **Role-Based Access**: Admin and basic user roles
- **Product Ownership**: Users can be associated with specific products
- **Link Management**: Users can manage their own marketing links

### Administrative Tools

- **Product Administration**: Full CRUD operations for products
- **User Administration**: User management and filtering
- **Association Management**: Control user-product relationships

## Security Features

- **Role-Based Authorization**: Admin-only endpoints for sensitive operations
- **User Ownership Validation**: Users can only modify their own links
- **Input Validation**: Comprehensive DTO validation using class-validator
- **URL Validation**: Ensures valid URLs for links and images

## Current Status & TODO

### Active Development Areas

- **Table Prefix Migration**: Transitioning from "mycuttingboard" to "cbc" prefixes
- **User-Product Logic**: Completing user-product association functionality
- **Wood Management**: Expanding wood type management features
- **Relationship Refactoring**: Implementing proper TypeORM relationships

### Completed Features

- ✅ Unified Products table (merged boards and coasters)
- ✅ Product-wood relationship tracking
- ✅ User-product association foundation
- ✅ Link management system
- ✅ Admin dashboard functionality

The platform provides a solid foundation for custom woodworking e-commerce with room for continued expansion and refinement of features.
