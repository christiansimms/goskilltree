import {Injectable} from '@angular/core';
import {HttpService} from "./http.service";

declare let jQuery: any;

@Injectable()
export class AuthService {

  currentUser: any;  // = '';

  constructor(private http: HttpService) {
  }

  // Used in debugging.
  //noinspection JSUnusedGlobalSymbols
  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentUserEmail() {
    return this.currentUser && this.currentUser.email;
  }

  isLoggedIn() {
    return !!this.getCurrentUserEmail();
  }

  logout() {
    return this.http.post('/api/auth/logout', {})
      .then(() => {
        // Logout is done, remember that.
        this.currentUser = null;
      });
  }

  firstTimeFetchCurrentUser() {
    // console.log('firstTimeFetchCurrentUser starting');
    return this.http
      .get('/api/get_current_user')
      .then(userObj => {
        // console.log('firstTimeFetchCurrentUser done');
        if (!userObj) {
          // Not authenticated yet.
          this.currentUser = null;
        } else {
          this.currentUser = userObj;
        }
      });
  }

  // In future: consider moving to another service, kind of lame to be here.
  //noinspection JSMethodCanBeStatic
  showContact() {
    // Display popup.
    jQuery('#contactModalPopup').modal();
    return false;  // Don't follow link.
  }

  submitContact(text) {
    return this.http.post('/api/contact', {text});
  }

}
