# My Free INV

## What is it?

This is a free inventory app.

## How to use it?

To use this app, you need to create a free account.

## TODO

* We need to re-organize for better readability and cleaner code.
  * re-organize folders to be more logical
  * resource folders for locations, room, and items with services and controllers
  * Central subapp controller AND service.  We should NOT be cross-using methods between
    the location, room, and item services.  If a method needs to call from more than one service
    it should be in the parent service - in this case freeinv.service.ts
  * Same goes for controllers, each service should have its own controller
  * Stick to single responsibility!!!

* Add middleware for serializing and deserializing objects so we are not sending unnecessary
  properties back to the client
* Add method for deleting a room
* Add method for deleting an item
