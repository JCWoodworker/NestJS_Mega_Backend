# JC's Nest.JS boilerplate

* Current features include:
  * PostgreSQL integration
    * TypeORM
    * Migrations
  * Auth via JWT in http-only cookies
    * Auth is enabled globally
      * Use the ```@SkipAuth``` custom decorator to change any endpoints to public
    * Password reset functionality
      * I utilized Email.JS so send reset emails but need to rethink that direction.
      * For now the code to run sending emails is commented out, and instead the url is returned in the response. --- dev and preprod only, though ---

--

## This README is a work in progress, and is more of a notebook for me while I build this API

* Please be patient while I construct a proper readme

--

## Handling Migrations

* ```npx typeorm migration:create src/migrations/{yourMigrationName}```

* Run ```yarn build``` before running ```run``` or ```revert```
  * ```npx typeorm migrate:run -d dist/typeorm-cli.config```
    * package.json shortcut: ```yarn migrate:run```
  * ```npx typeorm migrate:revert -d dist/typeorm-cli.config```
    * package.json shortcut: ```yarn migrate:revert```

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
  * /:id --> returns one specific user by id
  * /:username --> returns one specific user by username
* POST
  * / --> creates a new user if username and/or email doesn't already exist
* PATCH, DELETE
  * /:id --> updates or deletes a user by id

* NEST.JS VALIDATION - <https://docs.nestjs.com/techniques/validation>

--

## Configurations

```yarn add @nestjs/config @hapi/joi @Types Hapi__joi (dev)```

**QUICK NOTE ABOUT .ENV FILE AND JOI VALIDATION SCHEMA:**
When running in dev or debug mode the wathcher will not update when saving the .env file.  You'll need to update a ts file to trigger the refresh

* Hapi/Joi is for config validation

* I am circumventing the usual NestJS configService by using dotenv in the following:
  * /src/auth/decorators/skipAuth.decorator.ts
  
  ```import * as dotenv from 'dotenv';```
  ```dotenv.config();```

--

### CORS

* Remember to update ```app.enableCors()``` in main.ts
  * You'll want to specify the exact origins that are allowed to communicate with your api

...