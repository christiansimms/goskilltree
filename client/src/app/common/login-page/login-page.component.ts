import {Component, OnInit} from '@angular/core';
import {AuthService} from "../auth.service";

@Component({
  selector: 'app-login-page',
  template: `
<div class="text-center">
    <h1>Login and Learn</h1>
    <br/><br/>
    <p>
      <a href="/api/auth/google_oauth2">
      <img src="/assets/btn_google_signin_dark_normal_web.png" alt="Sign in with Google"/>
      </a>
    </p>
</div>
  `,
  styles: []
})
export class LoginPageComponent implements OnInit {

  constructor(private authService: AuthService) {
  }

  ngOnInit() {
  }

}
