import {Component} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {environment} from '../environments/environment';
import {AuthService} from "./common/auth.service";
import {EventService} from "./project/event.service";
import {complain} from "./project/ast/utils";
import 'rxjs/add/operator/filter';
import {FlashService} from "./common/flash.service";

declare let jQuery: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  contactForm = {messageText: ''};
  environment = environment;

  // Make some public for html template.
  constructor(private eventService: EventService, public router: Router, public authService: AuthService, private flashService: FlashService) {

    // One-time Dexie setup, to handle uncaught exceptions.
    (<any>window).onunhandledrejection = function (event) {
      event.preventDefault();
      let reason = event.reason;
      console.error('onunhandledrejection', event);
      complain('Unhandled promise rejection: ' + (reason && (reason.stack || reason)));
    };

    // Get user's identity on startup.
    //noinspection JSIgnoredPromiseFromCall
    // this.authService.firstTimeFetchCurrentUser();  --> moved to AppModule to avoid race condition at startup

    // Record routing events.
    router.events
      .filter(event => event instanceof NavigationEnd)
      .subscribe((event: NavigationEnd) => {
        // console.log('Router event', event);
        // Record all navigations except /event to view history.
        if (!event.urlAfterRedirects.startsWith('/event')) {
          this.eventService.recordEvent('navigate', null, event);
        }
      });
  }

  // Begin contact support.
  //noinspection JSMethodCanBeStatic
  // showContact() {   moved to authService, so it can be shared
  //   // Display popup.
  //   jQuery('#contactModalPopup').modal();
  //   return false;  // Don't follow link.
  // }

  submitContact() {
    jQuery('#contactModalPopup').find('.close').click();

    this.contactForm.messageText = this.contactForm.messageText.trim();

    // Better than choking on empty feedback, tell them sassy message.
    if (!this.contactForm.messageText) {
      this.flashService.tellSuccessImmediately('Thank you for your empty message.');
      return;
    }

    // Submit non-empty message.
    this.authService.submitContact(this.contactForm.messageText).then(() => {
      // Clear out form in case they send another message.
      this.contactForm.messageText = '';

      // Tell them good job.
      this.flashService.tellSuccessImmediately('Thank you for your message.');
    });
  }

  //noinspection JSMethodCanBeStatic
  cancelContact() {
    jQuery('#contactModalPopup').find('.close').click();
  }

  //noinspection JSUnusedGlobalSymbols
  logout() {
    this.authService.logout().then(() => {
      // Send them back home.
      return this.router.navigate(['/']);
    });
  }
}
