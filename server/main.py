import datetime
import json
import logging
import os
import traceback

import operator
import webapp2
from google.appengine.api import app_identity, mail
from google.appengine.ext import ndb
from oauth2client import client
from webapp2_extras import sessions
# noinspection PyUnresolvedReferences
import cloudstorage as gcs

import model

# Means running on my machine, and not Google's.
IS_DEV = not os.getenv('SERVER_SOFTWARE', '').startswith('Google App Engine/')

# Figure out current app id. This is "None" in DEV, but that's ok.
appid = app_identity.get_application_id()

# Figure out email ids.
APP_FROM_ADDRESS = 'message@%s.appspotmail.com' % appid
SEND_MESSAGE_TO = 'christian.simms@gmail.com'

# Log a message each time this module get loaded.
CURRENT_VERSION_ID = os.getenv('CURRENT_VERSION_ID')
logging.info('Loading %s, app id = %s, app version = %s, IS_DEV = %s',
             __name__, appid, CURRENT_VERSION_ID, IS_DEV)


def get_redirect_uri(request):
    # Can't just hardcode localhost:4200 if we're testing on another machine.
    # request.host_url is something like: http://localhost:4200
    return request.host_url + '/api/auth/google_oauth2callback'


ALL_SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'


# Utility stuff.
def get_now_timestamp():
    now = datetime.datetime.now()
    return now.isoformat()


# Identity helper plus security.
class Avatar(object):
    def __init__(self, user_obj):
        self.user_obj = user_obj

    def get_user_key(self):
        return self.user_obj.key

    def get_email(self):
        return self.user_obj.email

    def to_dict(self):
        return self.user_obj.to_dict()


class JsonEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ndb.Model):
            return obj.to_dict()
        elif isinstance(obj, datetime.datetime):
            return obj.isoformat()
        elif isinstance(obj, datetime.date):
            return obj.isoformat()
        return json.JSONEncoder.default(self, obj)


def json_dumps(obj):
    return json.dumps(obj, cls=JsonEncoder)


class BaseRequestHandler(webapp2.RequestHandler):
    # Most pages require auth, but a couple don't (like login).
    REQUIRES_AUTH = True

    def dispatch(self):
        """ Override dispatch to load/save session variables. """

        # Get a session store for this request.
        # noinspection PyAttributeOutsideInit
        self.session_store = sessions.get_store(request=self.request)

        # Get current logged in user, and throw exception if not found.
        # noinspection PyAttributeOutsideInit
        self.avatar = self.session.get('avatar', None)
        if self.REQUIRES_AUTH and not self.avatar:
            # Return status 401, client will detect that and send them to login page.
            self.error(401)
            return

        try:
            # Dispatch the request to the normal handler.
            webapp2.RequestHandler.dispatch(self)
        except Exception, e:

            # Log stack trace so we can see what happened.
            stacktrace = traceback.format_exc()
            logging.error("%s", stacktrace)

            # Return exception with message, in json format since all calls are ajax calls.
            self.error(500)
            self.write_json({'errorMessage': str(e.message)})
        finally:
            # Save all sessions.
            self.session_store.save_sessions(self.response)

    @webapp2.cached_property
    def session(self):
        """ Return a session using the default cookie key. """

        # Use the backend named below which is defined in config at bottom of file.
        return self.session_store.get_session(backend='datastore')

    def write_json(self, results):
        self.response.headers['Content-Type'] = 'application/json'
        self.response.out.write(json_dumps(results))

    # noinspection PyMethodMayBeStatic
    def get_insert_user_from_db(self, id_token):
        logging.info('DEBUG.get_insert_user_from_db called with: %s' % id_token)
        unique_id = id_token['sub']  # "sub" stands for "subject"
        email = id_token['email']
        # noinspection PyArgumentList
        user_db = model.User.get_or_insert(email, google_user_id=unique_id, email=email)
        return user_db


class GetCurrentUserHandler(BaseRequestHandler):
    REQUIRES_AUTH = False

    def get(self):
        """ Return current user, or 401. """

        if self.avatar:
            d = self.avatar.to_dict()
            d['app_version'] = CURRENT_VERSION_ID
            self.write_json(d)
        else:
            self.write_json(dict())


class GoogleOauth2Login(BaseRequestHandler):
    REQUIRES_AUTH = False

    def get(self):
        logging.info('GoogleOauth2Login called')
        if self.avatar:
            # Good, we're done.
            self.redirect('/')
        else:
            # Start auth.
            return self.redirect('/api/auth/google_oauth2callback')


class GoogleOauth2Callback(BaseRequestHandler):
    REQUIRES_AUTH = False

    def get(self):
        logging.info('GoogleOauth2Callback: starting')
        # noinspection PyArgumentList
        flow = client.flow_from_clientsecrets(
            'client_secrets.json',
            scope=ALL_SCOPES,
            redirect_uri=get_redirect_uri(self.request)
        )
        code = self.request.get('code')  # this is auth code
        if not code:
            # No code, let's start auth.
            logging.info('GoogleOauth2Callback: no code, starting auth')
            auth_uri = flow.step1_get_authorize_url()
            return self.redirect(str(auth_uri))  # convert f/unicode to str
        else:
            # Get credentials (refresh + access tokens) from auth code.
            logging.info('GoogleOauth2Callback: has auth code %s' % code)
            credentials = flow.step2_exchange(code)
            self.session['credentials'] = credentials.to_json()

            # Authentication is done -- save them and store in session.
            user_db = self.get_insert_user_from_db(credentials.id_token)

            # Store in session.
            self.session['avatar'] = Avatar(user_db)

            # Redirect to home -- now they're logged in.
            return self.redirect('/')


class LogoutHandler(BaseRequestHandler):
    REQUIRES_AUTH = False  # We don't care if you try to logout and you're not logged in.

    def get(self):
        """ Attempt logout. """

        # Remove everything from session. Leave cookie.
        # 2017-05-21: I don't really like this logout, but it seems ok, now that I pop everything from the session.
        for key in self.session.keys():
            self.session.pop(key)
        self.write_json('')

    def post(self):
        """ Don't care if you GET or POST this. """
        return self.get()


# Project stuff
FETCH_SIZE = 1000  # TODOfuture: Add pagination.


class AuthorProjectListHandler(BaseRequestHandler):
    REQUIRES_AUTH = False  # Let unauth users see list, but fail if they try to save new while unauthed.

    def get(self):
        """ Return all projects.
            Use Google projection so that we're not sending entire project contents.
        """

        cl = model.AuthorProject
        projects = cl.query() \
            .fetch(FETCH_SIZE, projection=cl.PROJECT_PROJECTED_COLS)

        # Only use latest version of each project. Added 2018-01-02.
        index = {}
        for project in projects:
            entry = index.get(project.title, None)
            if entry:
                # Only store if newer version.
                if project.version > entry.version:
                    index[project.title] = project
            else:
                # Store first occurrence.
                index[project.title] = project

        results = index.values()
        self.write_json(results)

    def post(self):
        """ Save new project. """

        # Get params.
        request_data = json.loads(self.request.body)

        # Create object.
        project = model.AuthorProject.create_new(avatar=self.avatar,
                                                 title=request_data['title'],
                                                 description=request_data.get('description', ''),  # make optional
                                                 template=request_data['template'],
                                                 tags=request_data.get('tags', []),
                                                 # make optional, tags is a list of strings
                                                 steps=request_data['steps'],
                                                 version=1,
                                                 )
        project_key = project.put()

        # Send response.
        # TODOfuture: web app needs id, but ipad version needs more fields to complete syncing.
        self.write_json(dict(
            id=project_key.urlsafe(),
            created_date=project.created_date,
            updated_date=project.updated_date,
        ))


class AuthorProjectDetailHandler(BaseRequestHandler):
    def get(self, project_id):
        project = ndb.Key.get(ndb.Key(urlsafe=project_id))
        assert project
        self.write_json(project.to_dict())


class AuthorProjectDetailByTitleHandler(BaseRequestHandler):
    def post(self, project_title):
        """ Save new version of existing project. """

        # Get param.
        upload_file = json.loads(self.request.get('uploadFile'))

        # Load previous version.
        cl = model.AuthorProject
        projects = cl.query() \
            .filter(cl.title == project_title) \
            .fetch(FETCH_SIZE)
        assert len(projects) > 0

        # Find most recent.
        # biggest_version = max([project.version for project in projects])
        newest_project = max(projects, key=lambda proj: proj.version)

        # Create object.
        project = model.AuthorProject.create_new(avatar=self.avatar,
                                                 title=newest_project.title,
                                                 description=newest_project.description,
                                                 template=newest_project.template,
                                                 tags=newest_project.tags,
                                                 # make optional, tags is a list of strings
                                                 steps=upload_file['steps'],  # only store the steps
                                                 version=newest_project.version + 1,
                                                 )
        project_key = project.put()

        # Send response.
        # TODOfuture: web app needs id, but ipad version needs more fields to complete syncing.
        self.write_json(dict(
            id=project_key.urlsafe(),
            created_date=project.created_date,
            updated_date=project.updated_date,
        ))


class AuthorProjectCompleteHandler(BaseRequestHandler):
    """ Just like AuthorProjectListHandler but return all fields, not a projection. """
    REQUIRES_AUTH = True

    def get(self):
        """ Return all author projects.
        """

        # Load all records.
        cl = model.AuthorProject
        results = cl.query() \
            .fetch(FETCH_SIZE)

        # Sort in memory, to avoid creating an index in appengine datastore.
        results = sorted(results, key=lambda row: row.title)
        
        self.write_json(results)


class PlayProjectListHandler(BaseRequestHandler):
    REQUIRES_AUTH = True

    def get(self):
        """ Return user projects.
            Use Google projection so that we're not sending entire project contents.
        """

        cl = model.PlayProject
        results = cl.query() \
            .filter(cl.owner == self.avatar.get_user_key()) \
            .fetch(FETCH_SIZE, projection=cl.PROJECT_PROJECTED_COLS)
        self.write_json(results)

    def post(self):
        """ Save new project. """

        # Get params.
        request_data = json.loads(self.request.body)

        # Create object.
        project = model.PlayProject.create_new(avatar=self.avatar,
                                               server_driver_id=request_data['server_driver_id'],
                                               title=request_data['title'],
                                               description=request_data.get('description', ''),  # make optional
                                               template=request_data.get('template'),
                                               tags=request_data.get('tags', []),
                                               # make optional, tags is a list of strings
                                               steps=request_data['steps'],
                                               latest_file_system=request_data['latest_file_system'],
                                               current_step=request_data['current_step'],
                                               total_steps=request_data['total_steps'],
                                               )
        project_key = project.put()

        # Send response.
        # TODOfuture: web app needs id, but ipad version needs more fields to complete syncing.
        self.write_json(dict(
            id=project_key.urlsafe(),
            created_date=project.created_date,
            updated_date=project.updated_date,
        ))


class PlayProjectDetailHandler(BaseRequestHandler):
    REQUIRES_AUTH = True

    def get(self, project_id):
        project = ndb.Key.get(ndb.Key(urlsafe=project_id))
        assert project
        if project.owner != self.avatar.get_user_key():
            raise Exception('You do not own that project.')
        self.write_json(project.to_dict())

    def post(self, project_id):
        """ Update existing project. """

        # Load project.
        project = ndb.Key.get(ndb.Key(urlsafe=project_id))
        assert project
        if project.owner != self.avatar.get_user_key():
            raise Exception('You do not own that project.')

        # Get params.
        request_data = json.loads(self.request.body)

        # Update and save data.
        project.steps = request_data['steps']
        project.latest_file_system = request_data['latest_file_system']
        project.current_step = request_data['current_step']
        project_key = project.put()

        # Say success.
        self.write_json(dict(
            id=project_key.urlsafe(),
            created_date=project.created_date,
            updated_date=project.updated_date,
        ))


class PlayProjectCompleteListHandler(BaseRequestHandler):
    """ Just like PlayProjectListHandler but return all fields, not a projection. """
    REQUIRES_AUTH = True

    def get(self):
        """ Return user projects.
        """

        cl = model.PlayProject
        results = cl.query() \
            .filter(cl.owner == self.avatar.get_user_key()) \
            .fetch(FETCH_SIZE)
        self.write_json(results)


# Keep directory outside of appengine (so it's not deployed).
LOCAL_GCS_DIR = os.path.join(os.path.dirname(__file__), '../.local-gcs')


class SaveEventsHandler(BaseRequestHandler):
    # noinspection PyMethodMayBeStatic
    def create_file_in_gcs(self, filename, contents):
        """Create a file.

        The retry_params specified in the open call will override the default
        retry params for this particular file handle.
        """

        write_retry_params = gcs.RetryParams(backoff_factor=1.1)
        gcs_file = gcs.open(filename,
                            'w',
                            content_type='text/plain',
                            retry_params=write_retry_params)
        gcs_file.write(json_dumps(contents))  # convert contents from json to string
        gcs_file.close()  # important -- this actually sends the file, so don't put it in try/except

    # noinspection PyMethodMayBeStatic
    def create_file_locally(self, filename, contents):
        """ Create file on local filesystem. Not to be run on appengine.
        """

        # Bummer, you cannot write files in dev appserver.
        # local_filename = '{}{}'.format(LOCAL_GCS_DIR, filename)  # filename starts with /, so don't include second /
        # local_dir = os.path.dirname(local_filename)
        # os.makedirs(local_dir)  # make sure it exists
        # logging.info('create_file_locally saving: %s' % local_filename)
        # f = open(local_filename)
        # f.write(contents)
        # f.close()
        new_event = model.Event.create_new(filename, contents)
        new_event.put()

    def post(self):
        # Get params.
        request_data = json.loads(self.request.body)
        unique_id = request_data['unique_id']
        events = request_data['events']

        # Create filename.
        bucket_name = os.environ.get('BUCKET_NAME', app_identity.get_default_gcs_bucket_name())
        filename = '/{}/events/{}/{}/{}.json'.format(bucket_name,
                                                     self.avatar.get_email(),
                                                     unique_id,
                                                     get_now_timestamp())
        logging.info('create_file saving: %s' % filename)

        # Create file.
        if IS_DEV:
            self.create_file_locally(filename, events)
        else:
            self.create_file_in_gcs(filename, events)
        logging.info('Done writing file')

        # Say success.
        self.write_json('')


class ContactHandler(BaseRequestHandler):
    REQUIRES_AUTH = True

    def post(self):
        """ Save new contact. """

        # Get params.
        request_data = json.loads(self.request.body)

        # Create object.
        text = request_data['text']
        message = model.Message.create_new(avatar=self.avatar,
                                           text=text,
                                           )
        message.put()

        # Send email to me.
        mail.send_mail(sender=APP_FROM_ADDRESS,
                       to=SEND_MESSAGE_TO,
                       subject='Message from: {}'.format(self.avatar.get_email()),
                       body=text,
                       )

        # Say success.
        self.write_json('')


TUTOR_DIR = 'tutors/'


class GetCannedTutorialHandler(BaseRequestHandler):
    def get(self, filename):
        """ Return a canned tutorial.
            Write code to avoid a gigantic security hole.
        """

        # Confirm it's a valid filename. That way hackers can't use ../../... to read other files.
        allowed = os.listdir(TUTOR_DIR)
        if filename in allowed:
            # Good, valid filename.
            f = open(TUTOR_DIR + filename, 'r')
            contents = f.read()
            f.close()

            self.response.headers['Content-Type'] = 'application/json'
            self.response.out.write(contents)
        else:
            raise Exception('Bad filename: {}'.format(filename))


# Configure sessions using cookies.
# Below, you can generate secret_key with:
# import random; print ''.join([random.choice('abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)') for i in range(50)])
# But it's used for session cookies, so once set, you should not change it between releases.

config = {'webapp2_extras.sessions': {
    'secret_key': 'l11p#z@5y*8f2fig)0^+l2kj(+^&$-6*z^ia#s)+t*(xd8j0j%',
    'cookie_name': 'session',  # this is the default anyway
    'cookie_args': {
        'max_age': 30 * 24 * 60 * 60,  # in seconds: 30 days
    },
    # 2017-05-20: Found the memcache was pretty flaky, would often forget my session after a period of time,
    # PLUS it consistently lost my session when I redeployed a new version of the app.  --> time for datastore!
    # It stores everything in a table named "Session".
    'backends': {
        'memcache': 'webapp2_extras.appengine.sessions_memcache.MemcacheSessionFactory',
        'datastore': 'webapp2_extras.appengine.sessions_ndb.DatastoreSessionFactory',
    },
}}

app = webapp2.WSGIApplication([
    # Auth stuff
    ('/api/get_current_user', GetCurrentUserHandler),
    ('/api/auth/google_oauth2', GoogleOauth2Login),
    ('/api/auth/google_oauth2callback', GoogleOauth2Callback),
    ('/api/auth/logout', LogoutHandler),
    # Author Project stuff
    ('/api/data/authorproject', AuthorProjectListHandler),
    ('/api/data/authorproject/(.+)', AuthorProjectDetailHandler),
    ('/api/data/authorproject_by_title/(.+)', AuthorProjectDetailByTitleHandler),
    ('/api/data/authorprojectcomplete', AuthorProjectCompleteHandler),
    # Play Project stuff
    ('/api/data/playproject', PlayProjectListHandler),
    ('/api/data/playproject/(.+)', PlayProjectDetailHandler),
    ('/api/data/playprojectcomplete', PlayProjectCompleteListHandler),
    # Event stuff
    ('/api/save_events', SaveEventsHandler),
    # Contact stuff
    ('/api/contact', ContactHandler),
    # Test support, only local dev
    ('/api/test/get_canned_tutorial/(.+)', GetCannedTutorialHandler),
], config=config, debug=True)
