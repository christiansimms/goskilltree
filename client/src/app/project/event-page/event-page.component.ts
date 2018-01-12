import {Component, OnInit} from '@angular/core';
import {EventService, IEvent} from "../event.service";

function getEventSummary(event: IEvent) {
  let what = event.what;
  switch (event.name) {
    case 'navigate':
      return what.urlAfterRedirects;
    case 'feedback-problem':
      return what;
    case 'start-play-project':
      return what.title;
    case 'resume-project':
      return 'Resuming step: ' + what;
    case 'jshint':
      let errors = what.errors;
      return errors.length + ' problems. First problem: ' + errors[0].message;  // + '\n' + what.context; displayed in html
    case 'feedback-diff':
      return what[1];  // It's a two element array, second part is string description
    case 'changes-complete':
    case 'save-and-preview':
      return '';  // nothing to say
    case 'advance-step':
      return 'Going to step: ' + what;
    default:
      return 'Unhandled event: ' + event.name;
  }
}

// How many surrounding lines for context.
let CONTEXT_LINE_COUNT = 2;

export function packageJshintEvent(jshintErrors, fileStr) {
  let lines = fileStr.split('\n');
  let firstError = jshintErrors[0];
  let fromLine = firstError.from.line;  // This is 0-based index.
  let firstLine = fromLine - CONTEXT_LINE_COUNT;
  if (firstLine < 0) {
    firstLine = 0;
  }
  let lastLine = fromLine + CONTEXT_LINE_COUNT;
  let snippet = lines.slice(firstLine, lastLine);

  // Return a structure containing context.
  return {
    context: snippet.join('\n'),
    errors: jshintErrors,
  };
}

@Component({
  selector: 'app-event-page',
  templateUrl: './event-page.component.html',
  styles: []
})
export class EventPageComponent implements OnInit {
  events: any;

  constructor(private eventService: EventService) {
  }

  ngOnInit() {
    this.refreshHistory();
  }

  refreshHistory() {
    // Load events.
    this.eventService.getAllEvents().then(events => {
      this.events = events;

      // Make short summary of events.
      events.forEach(event => {
        event['shortSummary'] = getEventSummary(event);
      });
    });
  }

  downloadEvents() {
    let text = JSON.stringify(this.events);
    let base64Encoded = btoa(text);
    let uri = 'data:application/json;charset=utf-8;base64,' + base64Encoded;
    let link = document.createElement("a");
    link.href = uri;
    (link as any).style = "visibility:hidden";
    let fileName = 'events';
    link.download = fileName + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  clearEvents() {
    //noinspection JSIgnoredPromiseFromCall
    this.eventService.deleteAllEvents().then(() => {
      this.refreshHistory();
    });
  }

}
