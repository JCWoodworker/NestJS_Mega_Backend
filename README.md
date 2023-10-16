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

* Send POST request with JSON of username and password.
* You'll receive an access token
* Use ```Authorization: Bearer {yourAccessTokenHere}``` in the header of any request that requires a JWT
  * NOTE - AuthGuard() is globally enabled.  This means that every endpoint is protected and requires a valid JWT
  * Use the custom SkipAuth() decorator to make any of your endpoints public
