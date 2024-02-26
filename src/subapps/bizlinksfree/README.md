# Biz Links Free

prod = www.bizlinksfree.com
preprod = www.bizlinkspreprod.netlify.app
base endpoint = /bizlinksfree

## What is it?

This is a free linklist app - similar to linktree

## How to use it?

* To use this app, you need to create a free account.
* A user logs in and adds/edits/deletes urls from their link list.
* User settings can be updated from their account page.

## Directory Structure

* The free inventory app is in the `src/subapps/bizlinksfree` folder.
  * This includes the module, controller, and service
* subfolders include:
 `dto`, `entities`, `migrations`, `seeders`, `services`, and `controllers`

## TODO

* We haven't really done much except for creating entities and migrations at this point.
* This entire API needs to be architected.

* Features needed:
  * User can add link url with display name
  * User can delete urls
  * User can edit urls
  * User can rearrange the order of their urls
  * User settings can be updated including:
    * Business name
    * Display Name
    * URL
    * Color Theme
    * Logo URL
    * Social Media Urls

* We need to add and implement seeders for the initial data.