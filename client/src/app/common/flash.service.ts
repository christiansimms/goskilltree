import { Injectable } from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import 'rxjs/add/operator/filter';


// NOTE: below, do array manipulation using splice, 'cause that's angular2 friendly.
// OK, be lazy and only handle one message at a time right now.
@Injectable()
export class FlashService {

  collectMessages: any = [];
  displayMessages: any = [];

  constructor(private router: Router) {

    // Services don't use ngOnInit(), just a constructor.
    router.events
      .filter(event => event instanceof NavigationEnd)
      .subscribe((event: NavigationEnd) => {

        // Send messages to display.
        // console.log('FlashService: Router event', event);
        this.displayMessages.pop();
        if (this.collectMessages.length > 0) {
          this.displayMessages.push(this.collectMessages[0]);
          this.collectMessages.pop();
        }
      });
  }

  tellSuccess(message, url) {  // Bummer, angular2 doesn't have router.reload
    this.collectMessages.pop();
    this.collectMessages.push(message);
    if (url) {
      //noinspection JSIgnoredPromiseFromCall
      this.router.navigate([url]);
    }
  }

  tellSuccessImmediately(message, url?) {
    this.collectMessages.pop();
    this.displayMessages.pop();
    this.displayMessages.push(message);
  }
}
