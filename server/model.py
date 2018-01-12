from google.appengine.ext import ndb


def is_projection(obj):
    """ Return whether given object is a projection. Either it's a list of projected fields, or it's an empty list. """
    # noinspection PyProtectedMember
    return bool(obj._projection)


class User(ndb.Model):
    google_user_id = ndb.StringProperty(required=True)
    email = ndb.StringProperty(required=True)


class AuthorProject(ndb.Model):
    """
    Each version starts at 1. Field "title" is the same across versions. Each version has a different "id".
    """
    owner = ndb.KeyProperty(kind=User, required=True)
    title = ndb.StringProperty(required=True)
    description = ndb.StringProperty()
    template = ndb.StringProperty()
    tags = ndb.StringProperty(repeated=True)
    steps = ndb.JsonProperty(required=True)  # json
    created_date = ndb.DateTimeProperty(auto_now_add=True)
    updated_date = ndb.DateTimeProperty(auto_now=True)
    version = ndb.IntegerProperty(required=True)

    PROJECT_PROJECTED_COLS = [
        title, description, version  # , tags -- bummer, can't include tags
    ]

    @classmethod
    def create_new(cls, avatar, title, description, template, tags, steps, version):
        obj = cls()
        obj.owner = avatar.get_user_key()
        obj.title = title
        obj.description = description
        obj.template = template
        obj.tags = tags
        obj.steps = steps
        obj.version = version
        return obj

    def to_dict(self):
        """ Return dict, including primary key which is not by default. """

        # noinspection PyTypeChecker
        if is_projection(self):
            names = self._projection
        else:
            names = set(self._properties.iterkeys())

        d = dict()
        d['id'] = self.key.urlsafe()
        for name in names:
            if name == 'owner':
                d['owner'] = self.owner.get().email
            else:
                d[name] = getattr(self, name)
        return d


class PlayProject(ndb.Model):
    # Keep in sync with IProject.
    owner = ndb.KeyProperty(kind=User, required=True)  # server-only
    server_driver_id = ndb.StringProperty(required=True)
    title = ndb.StringProperty(required=True)
    description = ndb.StringProperty()
    template = ndb.StringProperty()
    tags = ndb.StringProperty(repeated=True)
    steps = ndb.JsonProperty(required=True)
    latest_file_system = ndb.JsonProperty(required=True)
    current_step = ndb.IntegerProperty(required=True)
    total_steps = ndb.IntegerProperty(required=True)
    created_date = ndb.DateTimeProperty(auto_now_add=True)
    updated_date = ndb.DateTimeProperty(auto_now=True)

    PROJECT_PROJECTED_COLS = [
        server_driver_id, title, description, current_step, total_steps, updated_date  # bummer, can't include tags
    ]

    @classmethod
    def create_new(cls, avatar, server_driver_id, title, description, template, tags, steps, latest_file_system,
                   current_step, total_steps):
        obj = cls()
        obj.owner = avatar.get_user_key()
        obj.server_driver_id = str(server_driver_id)  # always convert to string
        obj.title = title
        obj.description = description
        obj.template = template
        obj.tags = tags
        obj.steps = steps
        obj.latest_file_system = latest_file_system
        obj.current_step = current_step
        obj.total_steps = total_steps
        return obj

    def to_dict(self):
        """ Return dict, including primary key which is not by default. """

        # noinspection PyTypeChecker
        if is_projection(self):
            names = self._projection
        else:
            names = set(self._properties.iterkeys())

        d = dict()
        d['id'] = self.key.urlsafe()
        for name in names:
            if name == 'owner':
                d['owner'] = self.owner.get().email
            else:
                d[name] = getattr(self, name)
        return d


class Message(ndb.Model):
    sender = ndb.KeyProperty(kind=User, required=True)
    text = ndb.TextProperty(required=True)  # make it TextProperty so it can be really long
    date = ndb.DateTimeProperty(auto_now_add=True)

    @classmethod
    def create_new(cls, avatar, text):
        obj = cls()
        obj.sender = avatar.get_user_key()
        obj.text = text
        return obj

    def to_dict(self):
        """ Return dict, including primary key which is not by default. """

        # noinspection PyTypeChecker
        if is_projection(self):
            names = self._projection
        else:
            names = set(self._properties.iterkeys())

        d = dict()
        d['id'] = self.key.urlsafe()
        for name in names:
            if name == 'sender':
                d['sender'] = self.sender.get().email
            else:
                d[name] = getattr(self, name)
        return d


# This is just for dev.
class Event(ndb.Model):
    filename = ndb.StringProperty(required=True)
    contents = ndb.JsonProperty()

    @classmethod
    def create_new(cls, filename, contents):
        obj = cls()
        obj.filename = filename
        obj.contents = contents
        return obj
