import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {ProjectService, IProject} from "../project/project.service";
import {EventService} from "../project/event.service";
import {AuthService} from "../common/auth.service";
import {AuthorService} from "../author/author.service";
import {PersistService} from "../persist.service";

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styles: []
})
export class HomePageComponent implements OnInit {
  localProjects: any;
  remoteProjects: any;

  // Make authService public for html template.
  //noinspection JSUnusedLocalSymbols,JSUnusedGlobalSymbols
  constructor(private projectService: ProjectService, private authorService: AuthorService, private persistService: PersistService, private eventService: EventService, private router: Router, public authService: AuthService) {
  }

  ngOnInit() {
    //noinspection JSIgnoredPromiseFromCall
    this.loadProjects();
  }

  private loadProjects() {
    return this.projectService.getAllProjects().then(localProjects => {
      return this.authorService.getRemoteProjects().then(remoteProjects => {

        // Remove local projects that are drivers -- i.e., those without driver_id.
        localProjects = localProjects.filter(localProject => localProject.driver_id);

        // Index local projects.
        let localProjectIndex = {};
        localProjects.forEach(function (localProject) {
          localProjectIndex[String(localProject.server_driver_id)] = localProject;
        });

        // Remove if remote is stored locally.
        remoteProjects = remoteProjects.filter(function (remoteProject) {
          let remoteProjectId = String(remoteProject.id);
          return !localProjectIndex[remoteProjectId];
        });

        this.localProjects = localProjects;
        this.remoteProjects = remoteProjects;
      });
    });
  }

  playRemoteProject(remoteProject) {
    return this.persistService.playRemoteProject(remoteProject).then(projectId => {
      return this.router.navigate(['/play/' + projectId + '/step/1']);
    });
  }

  // Send user to last step in project.
  resumeProject(localProject: IProject) {
    /*return*/
    this.projectService.loadProject(localProject.id).then(project => {
      let stepNum = project.steps.length + 1;
      this.eventService.recordEvent('resume-project', project.id, stepNum);
      return this.router.navigate(['/play/' + project.id + '/step/' + stepNum]);
    });
  }

  restartProject(localProject: IProject) {
    if (confirm("Are you sure you want to restart this project? Any changes you made in it will be lost.")) {
      this.projectService.deleteProject(localProject.id).then(() => {
        return this.persistService.playLocalAuthorProject(localProject.driver_id).then(newProjectId => {
          return this.router.navigate(['/play/' + newProjectId + '/step/1']);
        });
      });
    }
  }

}
