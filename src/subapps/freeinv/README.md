# My Free INV

prod = www.myfreeinv.com
preprod = www.myfreeinvpreprod.netlify.app
base endpoint = /freeinv

## What is it?

This is a free inventory app.

## How to use it?

To use this app, you need to create a free account.

## Directory Structure

* The free inventory app is in the `src/subapps/freeinv` folder.
  * This includes the module, controller, and service
* subfolders include:
 `dto`, `entities`, `migrations`, `seeders`, `services`, and `controllers`

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

* We need to change naming conventions to reflect "myfreeinv" instead of "freeinv"
  * folders, files, and endpoints

* We need to add and implement seeders for the initial data.

* We need to decide how we are generating and serving ads to the app and in emails
  * Ads are based on user data
    * What's in inventory
    * Meta tags
    * Links they've posted
    * Etc

* We need to enhance the experience of signing up for apps eventually.
  * Will there be a main dashboard where users can see their list of apps?
  * Do we refer to them as tools?
  * How can we make the ecosystem work together
  * How can we track usage?