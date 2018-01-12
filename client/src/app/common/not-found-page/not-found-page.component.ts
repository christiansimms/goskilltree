import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';


@Component({
  selector: 'app-not-found-page',
  template: `
<h1>Page Not Found</h1>
<p>
    The page <span style="font-style: italic">{{router.url}}</span> was not found.
    Why don't you go <a routerLink="/">Home</a> and try again.
</p>
  `,
  styles: []
})
export class NotFoundPageComponent implements OnInit {

  constructor(public router: Router) {
  }

  ngOnInit() {
  }

}
