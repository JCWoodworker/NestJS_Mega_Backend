# This is a Nest.JS boilerplate and will include JWT auth and PostgreSQL integration

## This README is a work in progress, and is more of a notebook for me while I build this API

* Please be patient while I construct a proper readme

## Handling Migrations

* FIRST - Run ```yarn build``` before running ```run``` or ```revert```

* ```npx typeorm migration:create src/migrations/{yourMigrationName}```
* ```npx typeorm migration:run -d dist/typeorm-cli.config```
  * ```yarn migration:run```
* ```npx typeorm migration:revert -d dist/typeorm-cli.config```
  * ```yarn migration:revert```

## Auth

* Send POST request in the following format:
  { "username": "someuser",
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
  * :/username/:username --> returns one specific user by username
* POST
  * / --> creates a new user if username and/or email doesn't already exist
* PATCH, DELETE
  * /:id --> updates or deletes a user by id

* NEST.JS VALIDATION - <https://docs.nestjs.com/techniques/validation>
