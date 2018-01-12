import {Component, OnInit} from '@angular/core';
import {FlashService} from "../flash.service";

@Component({
  selector: 'app-flash',
  template: `
<div *ngFor="let message of flashService.displayMessages" class="alert alert-success alert-dismissable" role="alert">
  <button type="button" class="close" aria-label="Close" (click)="clearAllMessages()">
    <span aria-hidden="true">&times;</span>
  </button>
  {{message}}
</div>
  `,
  styles: []
})
export class FlashComponent implements OnInit {

  // Make public for html template.
  constructor(public flashService: FlashService) {
  }

  ngOnInit() {
  }

  // FlashService only supports 1 message at a time, so this is ok.
  clearAllMessages() {
    // We cannot let bootstrap clear alert (using data-dismiss="alert") b/c that changes the DOM but not our data.
    this.flashService.displayMessages.pop();
  }

}
