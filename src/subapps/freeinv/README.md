# My Free INV

## What is it?

This is a free inventory app.

## How to use it?

To use this app, you need to create a free account.

## TODO

* Add controllers for each service and connect them to the freeinv main controller
  * re-organize folders to be more logical
    * resource folders for locations, room, and items with services and controllers
* Add middleware to reduce return objects to only the necessary information
  * This can be a generic function that takes an object and returns an object with only the necessary information by accepting strings as arguments for the keys
* Add method for deleting a room
* Add method for deleting an item
