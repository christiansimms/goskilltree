import { Component, OnInit } from '@angular/core';
import {AuthorService} from "../../author/author.service";

@Component({
  selector: 'app-remote-author-page',
  templateUrl: './remote-author-page.component.html',
  styles: []
})
export class RemoteAuthorPageComponent implements OnInit {

  remoteProjects: any;

  constructor(private authorService: AuthorService) { }

  ngOnInit() {
    return this.authorService.getRemoteProjectsComplete().then(projects => {
      this.remoteProjects = projects;
    });
  }

  showStepsInfo(steps) {
    return JSON.stringify(steps).length;
  }
}
