## TODO: 
* The entire backend needs an overhaul
* [ ] Boards and Coasters tables need to be merged into one "Products" table
  * [x] Use the following structure to create the table:
  `CREATE TABLE "cbc_products" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "user_id" character varying NOT NULL,
      "type" character varying NOT NULL DEFAULT 'cutting_board',
      "title" character varying NOT NULL,
      "description" character varying,
      "customer_message" character varying,
      "image_url" character varying,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )`
  * [x] Add an entity
  * [x] Update imports and methods in Services
  * [x] Update imports and methods in Controllers
  * [ ] update Module

* [ ] Change "mycuttingboard_boards_and_woods" to "cbc_products_and_woods"
* [ ] Change all other table prefixes from "mycuttingboard" to "cbc"