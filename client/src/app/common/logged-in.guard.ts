import {Injectable} from '@angular/core';
import {CanActivate, ActivatedRouteSnapshot, Router, RouterStateSnapshot} from '@angular/router';
import {Observable} from 'rxjs/Observable';
import {AuthService} from "./auth.service";

@Injectable()
export class LoggedInGuard implements CanActivate {

  constructor(private router: Router, private authService: AuthService) {
  }

  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  canActivate(next: ActivatedRouteSnapshot,
              state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {

    // If user is not logged in we'll send them to the homepage
    // console.log('LoggedInGuard checking user');
    if (!this.authService.isLoggedIn()) {
      //noinspection JSIgnoredPromiseFromCall
      this.router.navigate(['']);
      return false;
    } else {
      return true;
    }
  }
}
