# Web app to learn how to program

This project has two parts, a client and a server.
The server is a simple Ajax app which runs on Google AppEngine.
The client is an Angular 4 app.



## Build Setup

If you want to run and test this locally:

``` bash
# One-time: install server dependencies
# Follow directions at: https://cloud.google.com/appengine/docs/standard/python/download

# Run server locally:
make runserver


# Then go to a second terminal window:
# One-time: install client dependencies
cd client && npm install

# serve with hot reload at http://localhost:4200
cd client && ng serve --proxy-config proxy.conf.json
```

