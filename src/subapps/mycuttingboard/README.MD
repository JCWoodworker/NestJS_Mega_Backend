## TODO: 

* [ ] Change all other table prefixes from "mycuttingboard" to "cbc"

## Completed TODOs:

* [X] Boards and Coasters tables need to be merged into one "Products" table
  * [x] Use the following structure to create the table:
  'CREATE TABLE "cbc_products" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "user_id" character varying NOT NULL,
      "type" character varying NOT NULL DEFAULT 'cutting_board',
      "title" character varying NOT NULL,
      "description" character varying,
      "customer_message" character varying,
      "image_url" character varying,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )'
  * [x] Add Product entity
  * [x] Update imports and methods in Services
  * [x] Update imports and methods in Controllers
  * [x] update Module
* [x] Delete all code pertaining to boards and coasters and remove imports and instances of them
  * [x] boards service
  * [x] boards controller
  * [x] boards entity
  * [x] boards migration
  * [x] coasters service
  * [x] coasters controller 
  * [x] coasters entity
  * [x] coasters migration
  * [x] remove all imports for boards
  * [x] remove all imports for coasters
  * [x] Manually delete mycuttingboard_boards table from database
    * [x] Dev
    * [x] Preprod
    * [x] Prod
  * [x] Manually delete mycuttingboard_coasters table from database
    * [x] Dev
    * [x] Preprod
    * [x] Prod
* [x] Rename mycuttingboard_boards_and_woods table to cbc_products_and_woods
  * [x] update entity
  * [x] migration
  * [x] Manually delete mycuttingboard_boards_and_woods table from database
    * [x] Dev
    * [x] Preprod
    * [x] Prod
  * [x] Run new migrations
    * [x] dev
    * [x] preprod
    * [x] prod
