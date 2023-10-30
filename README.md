# JC's Nest.JS boilerplate

* Current features include:
  * PostgreSQL integration
    * TypeORM
    * Migrations
  * Auth via JWT in http-only cookies
    * Auth is enabled globally
      * Use the ```@SkipAuth``` custom decorator to change any endpoints to public
    * Password reset functionality is coming in the first week of November, 2023
      * I'll be utilizing Email.JS so send reset emails

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

## Configurations

### CORS

* Remember to update ```app.enableCors()``` in main.ts
  * You'll want to specify the exact origins that are allowed to communicate with your api

### Password Reset

* This will be configured to use my Email JS account when I eventually build it
* You can set up your own account at <https://www.emailjs.com>

* Currently a passwordResetJwt and passwordResetToken are created, encrypted, then persisted to the user database under the specific email requesting the reset
  * These tokens need to be in their own separate table with a one-to-one relationship set up with their user
  * A request with body ```{ "email": "<useremail@whatever.com>"}``` must be sent to /auth/reset-password/request
* A URL is generated in the form of `http://localhost:3000/auth/reset-password/reset_password?token=${passwordResetJwt}&jwt=${passwordResetToken}` and sent to the user
