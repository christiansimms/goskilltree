import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-reference-library',
  templateUrl: './reference-library.component.html',
  styles: ['.ref-border { border: 1px solid LightGrey; padding: 0 0.5em 0.5em 0.5em; }']
})
export class ReferenceLibraryComponent implements OnInit {

  @Input() project: any;

  constructor() { }

  ngOnInit() {
  }

}
