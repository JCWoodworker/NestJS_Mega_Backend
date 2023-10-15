# This is a Nest.JS boilerplate and will include JWT auth and PostgreSQL integration

## Handling Migrations

* FIRST - Run ```yarn build``` before running ```run``` or ```revert```

* ```npx typeorm migration:create src/migrations/{yourMigrationName}```
* ```npx typeorm migration:run -d dist/typeorm-cli.config```
  * ```yarn migration:run```
* ```npx typeorm migration:revert -d dist/typeorm-cli.config```
  * ```yarn migration:revert```


