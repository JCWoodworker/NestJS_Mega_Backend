# FOR JAMES FROM JAMES --- TOP PRIORITY --- All others please just disregard this :-)

* We fixed the issues with the reset link and token expiration
* NOW we need to make sure that we re-factor other areas of the API with token expirations
  * Wrote new functions to handle returning a boolean for whether or not a token is expired

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
* Upon successful login the following will happen:
  * An access_token and refresh_token will be created and sent in the response cookie
    * This is an http only cookie and cannot be accessed using JS in the frontend
    * The refresh token will be encrypted and persisted in the users table for the logged in user
  * NOTE - AuthGuard() is globally enabled.  This means that every endpoint is protected and requires a valid JWT
    * Thanks to the http only cookie every request from the front end will have the valid JWT until the user logs out our the JWT expires
    * The endpoint ```/auth/refresh``` will refresh the user's token when pinged.
      * No logic has been written to make this happen automatically yet
    * Use the endpoint ```/auth/logout``` to log the user out and clear http only cookies
    * Use the custom SkipAuth() decorator to make any of your endpoints public
* When writing a new endpoint that requires auth, use @Req to get req.user
  * The JWT will have all user information including userType!
  * The JWT secret should be set in your .env file, and the settings on AuthModule automatically pass your secret key to the jwt whenever signing or verifying:
  ```JwtModule.register({```
    ```global: true,```
    ```secret: jwtConstants.accessSecret,```
  ```}),```
--

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

### Password Reset

* Currently being built out as of 10/31/23 and due to be finished by 11/5/23
* This will be configured to use my Email JS account when I eventually build it
* You can set up your own account at <https://www.emailjs.com>

ENDPOINTS:
POST - ```auth/reset-password/request```
GET - ```auth/reset-password/reset```
POST - ```auth/reset-password/reset```

* A passwordResetJwt and passwordResetToken are created, encrypted, then persisted to the user database under the specific email requesting the reset
  * These tokens need to be separated to their own separate table with a one-to-one relationship to their user in the future
* A request with body ```{ "email": "<useremail@whatever.com>"}``` must be sent to ```/auth/reset-password/request```
* A URL is generated in the form of `http://localhost:3000/auth/reset_password/reset?token=${passwordResetJwt}&jwt=${passwordResetToken}` and sent to the user if that user exists
  * The same message will always be returned `If user with email ${userEmail} exists, a password reset link will be sent` for security purposes
* When the user clicks the url a GET request is initiated and the following takes place:
  * token and jwt are extracted from the url
  * they are compared with the encrypted token and jwt that was persisted to the users table
  * further validation makes sure the user's email matches too
  * a new access_token with a 3 minute expiry is set in http-only cookie
  * the frontend should now rout them to a form to update their password
* a POST request should be sent to ```auth/reset-password/reset``` with the user's updated password
  * This will once again clear all token cookies and persist the new encrypted password to the users table

* More info on the way as I continue to build this out!!

--

### DOUBLE CHECK JWT ACCESS SECRETS ... MAKE SURE THEY'RE BEING USED IN YOUR CODE

* I'm mainly referring to the issue of not using them to decode jwts!!!
