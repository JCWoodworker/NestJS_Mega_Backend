## TODO: 
* The entire backend needs an overhaul
* [ ] Boards and Coasters tables need to be merged into one "Products" table
  * Use the following structure:
  `CREATE TABLE "cbc_products" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "user_id" character varying NOT NULL,
      "board_type" character varying NOT NULL,
      "board_description" character varying,
      "customer_message" character varying,
      "board_image_url" character varying,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )`
* [ ] Change "mycuttingboard_boards_and_woods" to "cbc_products_and_woods"
* [ ] Change all other table prefixes from "mycuttingboard" to "cbc"