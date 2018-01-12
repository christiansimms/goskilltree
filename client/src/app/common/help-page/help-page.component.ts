import { Component, OnInit } from '@angular/core';
import {AuthService} from "../auth.service";

@Component({
  selector: 'app-help-page',
  templateUrl: './help-page.component.html',
  styles: []
})
export class HelpPageComponent implements OnInit {

  // Make authService public since html template uses it.
  constructor(public authService: AuthService) { }

  ngOnInit() {
  }

}
