# TODO

* [ ] Create all logic for user-and-products feature
  * [x] Table = cbc_user_and_products (migration)
  * [x] Entity = CbcUserAndProducts - cbcUserAndProducts.entity.ts
  * [x] DTOs
  * [ ] Service - Add to admin service only.  Unnecessary to create it's own service.
* [ ] Change all other table prefixes from "mycuttingboard" to "cbc"
  * [ ] Remove the following migrations and tables from dev, preprod, and prod DBs
    * [ ] createWoodsTable
    * [ ] createLinksTable
    * [ ] createUserLinksTable
  * [ ] Create new migrations:
    * [ ] create-wood-table:
      await queryRunner.query(
        'CREATE TABLE "cbc_wood" (
          "id" SERIAL NOT NULL PRIMARY KEY,
          "name" character varying NOT NULL,
          "description" character varying,
          "region" character varying,
          "hardness" character varying,
          "image_url" character varying,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )',
      );
    * [ ] create-link-table:
      await queryRunner.query(
        'CREATE TABLE "cbc_link" (
          "id" SERIAL NOT NULL PRIMARY KEY,
          "link_url" character varying NOT NULL,
          "link_display_name" character varying NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )',
      );
    * [ ] create-user-link-join-table:
      await queryRunner.query(
      'CREATE TABLE "cbc_user_link" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "user_id" character varying NOT NULL,
        "link_id" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )',
      );
  * [ ] Update entities
    * [ ] cbcWood.entity.ts
    * [ ] cbcLink.entity.ts
    * [ ] cbcUserLink.entity.ts
  * [ ] Update DTOs
    * [ ] create-wood.dto.ts
    * [ ] update-wood.dto.ts
  * [ ] Run new migrations
    * [ ] dev
    * [ ] preprod
    * [ ] prod

## Completed TODOs

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
