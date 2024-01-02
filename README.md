# JC's Nest.JS boilerplate

## This README is a work in progress, and is more of a notebook for me while I build this API

* Please be patient while I construct a proper readme

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

## Auth

* Send POST request in the following JSON format:
  {
    "username": "someuser",
    "password": "mypassword"
  }

## Pre-built endpoints

Multiple user endpoints have been set up at '/users':

* GET:
  * /getallusers --> returns an array of all users (id, username, email)
  <!-- * /:id returns one specific user by id -->
  <!-- * /:username --> returns one specific user by username --> -->
* POST
  * / --> creates a new user if username and/or email doesn't already exist
* PATCH, DELETE
  <!-- * /:id --> updates or deletes a user by id -->

* NEST.JS VALIDATION - <https://docs.nestjs.com/techniques/validation>

--

## Configurations

```yarn add @nestjs/config @hapi/joi @Types Hapi__joi (dev)```

**QUICK NOTE ABOUT .ENV FILE AND JOI VALIDATION SCHEMA:**
When running in dev or debug mode the wathcher will not update when saving the .env file.  You'll need to update a ts file to trigger a refresh

* Hapi/Joi is for config validation

* I am circumventing the usual NestJS configService by using dotenv in the following:
  * /src/auth/decorators/skipAuth.decorator.ts
  
  ```import * as dotenv from 'dotenv';```
  ```dotenv.config();```

--

### CORS

* CORS is enabled in main.ts and looks for an array of allowed origins
  * Store your allowed orgins in .env under ALLOWED_ORIGINS

### You will need to set the following variables

* Create a .env file for local development
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
DATABASE_URL

ALLOWED_ORIGINS=origin1,origin2,origin3
