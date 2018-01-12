import {Injectable} from '@angular/core';
import Dexie from 'dexie';
import {AuthService} from "../common/auth.service";
import {HttpService} from "../common/http.service";

export interface IEvent {
  id?: number;
  name?: string;  // type of event, like: navigate
  project_id?: number;
  timestamp?: any;
  what?: any;
}

export interface IEventConfig {
  id?: number;
  name: string;
  value: string;
}

// Make event database be separate from project database.
// That way you can independent transactions for free, since Dexie txns are per-database.
class EventDatabase extends Dexie {
  events: Dexie.Table<IEvent, number>;
  eventConfig: Dexie.Table<IEventConfig, number>;

  constructor() {
    super("EventDatabase");
    this.version(1).stores({
      events: '++id, project_id', // don't index other fields
      eventConfig: '++id, &name', // id is sequence pk, name is unique, don't index other fields
    });
  }
}

@Injectable()
export class EventService {
  private db: EventDatabase;
  private events: Dexie.Table<IEvent, number>;
  private eventConfig: Dexie.Table<IEventConfig, number>;
  private SAVE_EVENTS_EVERY = 10;  // Make this small enough that it doesn't hit any appengine limit on txn size.
  private uniqueId: string;

  constructor(private http: HttpService, private authService: AuthService) {
    this.db = new EventDatabase();
    this.events = this.db.events;
    this.eventConfig = this.db.eventConfig;
  }

  // Return Dexie promise which returns unique_id.
  getCachedUniqueId(): Dexie.Promise<string> {
    if (this.uniqueId) {
      // Use the cached value.
      return Dexie.Promise.resolve(this.uniqueId);
    } else {
      // Load or create one.
      return this.eventConfig.where('name').equals('unique_id').toArray().then(entries => {
        // console.log('DEBUG.recordEvent found unique_id: ', entries);
        if (entries.length === 0) {
          // Add one.
          this.uniqueId = new Date().toISOString();
          // console.log('DEBUG.recordEvent adding unique_id', this.uniqueId);
          let eventConfig: IEventConfig = {name: 'unique_id', value: this.uniqueId};
          return this.eventConfig.add(eventConfig).then(() => {
            return this.uniqueId;
          });
        } else {
          // Store it and use it.
          this.uniqueId = entries[0].value;
          return this.uniqueId;
        }
      });
    }
  }

  // Record given given with name. This should be called on most user actions like buttons.
  // We will not return the promise for saving, since we want this independent of other txns.
  recordEvent(name: string, projectId: number, what: any) {
    let eventData = {name: name, project_id: projectId, timestamp: new Date(), what: what};

    this.events.add(eventData).then(newEventId => {
      let shouldSave = (newEventId % this.SAVE_EVENTS_EVERY === 0) || name === 'changes-complete';
      // if (true) {
      //   console.log('DEBUG.recordEvent', name, newEventId, shouldSave, event);
      // }
      if (shouldSave && !this.authService.isLoggedIn()) {
        // console.log('DEBUG.recordEvent *not* saving because not logged in');
        shouldSave = false;
      }
      if (shouldSave) {
        // console.log('DEBUG.recordEvent uploading events');
        return this.getCachedUniqueId().then(uniqueId => {
          return this.getAllEvents().then(events => {
            // Dexie txn done, now send to server.
            return this.http
              .post('/api/save_events', {unique_id: uniqueId, events: events})
              .then(() => {
                // Good response, clear them out.
                let eventPks = [];
                events.forEach(event => {
                  eventPks.push(event.id);
                });
                // console.log('DEBUG.recordEvent deleting events', eventPks);
                return this.db.events.bulkDelete(eventPks);
              });
          });
        });
      }
    });
  }

  getAllEvents() {
    // return this.events.orderBy(['project_id', 'id']).toArray();
    return this.events.toArray();
  }

  deleteAllEvents() {
    return this.events.clear();
  }
}
