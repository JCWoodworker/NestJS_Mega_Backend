# JC's Nest.JS boilerplate

## Table Of Contents

* [Current Features](#current-features)
* [Handling Migrations](#handling-migrations)
* [Configurations](#configurations)
* [CORS](#cors)

## This README is a work in progress, and is more of a notebook for me while I build this API - LOTS of new work has been done as of 12/01/2024 (02/28/25 actually) that needs to be documented and has NOT been written down yet

* Please be patient while I construct a more detailed README
* Each subapp has their own README

## Current Features

* Current features include:
  * PostgreSQL integration
    * TypeORM
    * Migrations
  * Authentication and Authorization
    * Sign up with email and password OR use Google
    * Successful sign in creates JWT access and refresh tokens
      * Currently returns in the following format:
        {
          "access_token": "SomeLongAssAccessToken",
          "refresh_token": "SomeLongAssRefreshToken"
        }
      * Refresh ID is stored in the database to check against the refresh token
    * Refresh endpoint checks DB for matching refresh ID and returns new access and refresh tokens
  * Pre-built endpoints for CRUD operations on Users
    * Get all users
    * Get current active user
  * All endpoints globally set to require bearer authentication
    * Guard set up to open any endpoint or an entire controller to public access
  * User role guard lets you set any endpoint or controller to "Admin" or "Basic" user access
  * Multiple apps supported BUT
    * Current logic to assign app IDs is terrible and does not work as intended
    * Too much inconsistency across subapps with naming conventions, syntax and style
    * Abandoned email and password sign up/in in later apps (CBC)
      * Due to security concerns
      * Only using Google Sign in for now

--

## Handling Migrations

* ```npx typeorm migration:create src/migrations/{yourMigrationName}```

* Run ```yarn build``` before running ```run``` or ```revert```
  * ```npx typeorm migrate:run -d dist/typeorm-cli.config```
    * package.json shortcut: ```yarn migrate:run```
  * ```npx typeorm migrate:revert -d dist/typeorm-cli.config```
    * package.json shortcut: ```yarn migrate:revert```

* You NEED to run ```yarn build``` before running ```run``` or ```revert```
  * They need to run as JS files so they need to be built first

--

## Configurations

```yarn add @nestjs/config @hapi/joi @Types Hapi__joi (dev)```

**QUICK NOTE ABOUT .ENV FILE AND JOI VALIDATION SCHEMA:**
When running in dev or debug mode the watcher will not update when saving the .env file.  You'll need to update a ts file to trigger a refresh (or just restart the server).

* Hapi/Joi is for config validation

* I am circumventing the usual NestJS configService by using dotenv in the following:
  * /src/auth/decorators/skipAuth.decorator.ts
  
  ```import * as dotenv from 'dotenv';```
  ```dotenv.config();```

--

### CORS

* CORS is enabled in main.ts and looks for an array of allowed origins
  * Store your allowed origins in .env under ALLOWED_ORIGINS

### You will need to set the following variables

* Create a new .env file for local development
* Add these to your env list with whatever hosting service you are using

ENVIRONMENT=development (other options are "preprod" and "prod")

DEVELOPMENT_DOMAIN=<http://localhost:3000>
PREPROD_DOMAIN=your-preprod-domain
PROD_DOMAIN=your-prod-domain

JWT_SECRET=your-jwt-secret
JWT_TOKEN_AUDIENCE=localhost:3000
JWT_TOKEN_ISSUER=localhost:3000
JWT_ACCESS_TOKEN_TTL=this-should-be-a-number-in-seconds
JWT_REFRESH_TOKEN_TTL=this-should-be-a-number-in-seconds

* Set up your project with Google OAuth - <https://console.cloud.google.com/apis/credentials>
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

DATABASE_HOST
DATABASE_PORT
DATABASE_USERNAME
DATABASE_PASSWORD
DATABASE_NAME

* URL Structure: postgres://{username}:{password}@{host}:{port}/{database name}
* DATABASE_URL={{See URL Structure Above}}

ALLOWED_ORIGINS=origin1,origin2,origin3

## TODOs

* Fix all instances of camelCase in migrations!!
  * We need to be more consistent with naming conventions
  * example:
    * "subscription_tier" character varying NOT NULL DEFAULT 'basic',
  * We've decided on snake case for all database variables

* Update README files for the following:
  * config
  * iam
  * subapps
    * freeinv
    * bizlinksfree
  * users
  * WHAT ARE WE WRITING ABOUT??
    * Structure
    * Endpoints
    * Guards
    * Models
    * Migrations
    * DTO's
    * Services
    * Controllers
    * Middleware
    * Entities
    * Enums
    * Seeders
    * TODOs

* SEE EACH README FOR THEIR SPECIFIC TODOs

**THIS README**
* Add directory map
  * We need to show the structure, then explain how/why it is set up that way
* Full HOW-TO guides for the following:
  * Setting up this repo if cloning for your own project
  * Adding Subapps
  * Handling Migrations and setting up Postgres connection
  * Managing resources
  * Setting up configurations
    * Main.ts settings
    * .env settings
    * CORS settings
  * TODOs
