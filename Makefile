
# The first command in the Makefile is the default:
help:
	@echo "Available commands:"
	@sed -n '/^[a-zA-Z0-9_.]*:/s/:.*//p' <Makefile | sort



# Appengine:
DEV_APPSERVER_FLAGS?=--skip_sdk_update_check --auto_id_policy=sequential --datastore_path=.dev_appserver.datastore

runserver:
	cd server && dev_appserver.py $(DEV_APPSERVER_FLAGS) --port=6565 --admin_port=9091 app.yaml

# Run client:
runclient:
	cd client && ng serve --proxy-config proxy.conf.json

runclient_share:
	#cd client && ng serve --proxy-config proxy.conf.json --host=0.0.0.0
	cd client && ng serve --proxy-config proxy.conf.json --host=192.168.1.8.nip.io
	echo Now go to: http://192.168.1.8.nip.io:4200/

# Builds:
clean:
	cd client && rm -rf coverage dist

# Dev:
devbuild: clean
	cd client && ng build --dev
	cp -r server/* client/dist/
	sed -e 's,../client/dist/,,g' server/app.yaml > client/dist/app.yaml

rundevbuild:
	cd client/dist && dev_appserver.py $(DEV_APPSERVER_FLAGS) --port=6565 --admin_port=9091 app.yaml

testdev: devbuild rundevbuild

#devtest:
#	echo Go to: http://localhost:6565
#
#devall: devbuild devtest

devappenginedeploy:
	cd client/dist && gcloud app deploy --project testlearnx

devdeploy: devbuild devappenginedeploy

# Prod:
prodbuild: clean
	cd client && ng build --prod
	cp -r server/* client/dist/
	cd client/dist && mv client_secrets-official.json client_secrets.json
	sed -e 's,../client/dist/,,g' server/app.yaml > client/dist/app.yaml

prodappenginedeploy:
	cd client/dist && gcloud app deploy --project goskilltree

proddeploy: prodbuild prodappenginedeploy


