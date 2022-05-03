# Group Ironmen Tracker Frontend and Backend
Website: [groupiron.men](https://groupiron.men)

Source for plugin: [https://github.com/christoabrown/group-ironmen-tracker](https://github.com/christoabrown/group-ironmen-tracker)

This repo is for the frontend website and backend of the above plugin.

This plugin tracks information about your group ironman player and sends it to a server where you and your other group members can view it. Currently it tracks:

* Inventory, equipment, bank, rune pouch, and shared bank
* Skill XP
* World position, viewable in an interactive map
* HP, prayer, energy, and world as well as showing inactivity
* Quest state - completed, finished, in progress

# Self-hosting

It is possible to self-host the frontend and backend rather than use [groupiron.men](https://groupiron.men).

In the plugin settings, put the URL that you are hosting the website on. Leaving it blank will default to https://groupiron.men.

![](https://i.imgur.com/0JFD7D5.png)


## With Docker

Prerequisites

* Docker
* docker-compose

### With docker-compose

Copy the `docker-compose.yml`, `.env.example`, and `schema.sql` (exists in `server/src/sql`) files onto your server.

Copy the contents of `.env.example` into a new file named `.env` in the same directory and fill it with your secrets.

The `.env` file explains what should go into each secret.

The `docker-compose.yml` has a line that takes the path to the `schema.sql`. Make sure to update this to the relative or absolute path of the file on your server.

After you have set up the `.env` file and `schema.sql` path, you can run `docker-compose up -d` and this will spin up both the frontend and backend. The backend should be available on port 5000 and the frontend on port 4000, although these can be changed in the docker-compose file.

### Without docker-compose (untested)

If you are not using the docker-compose, then you will have to set up the Postgres database and pass secrets in using Docker environment variables. See below in the [Without Docker](#without-docker) section for how to set up the database.

You can then run the following to run the image for the frontend, adding the values of the environment variables:

```sh
docker run -d -e HOST_URL= chrisleeeee/group-ironmen-tracker-frontend
```

Same thing for the backend:

```sh
docker run -d -e PG_USER= -e PG_PASSWORD= -e PG_HOST= -e PG_PORT=  -e PG_DB= -e BACKEND_SECRET= chrisleeeee/group-ironmen-tracker-backend
```

Check `.env.example` for an explanation on what the value of each environment variable should be.

Once it's running, the backend should be available on port 8080 and the frontend on port 4000.

## Without Docker

To be filled...
