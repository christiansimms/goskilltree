import {Component, OnInit, Pipe, PipeTransform} from '@angular/core';
import {Router} from '@angular/router';
import {ProjectService, IProject} from "../project/project.service";
import {AuthService} from "../common/auth.service";
import {EventService} from "../project/event.service";
import {AuthorService, IAuthorProject} from "../author/author.service";
import {PersistService} from "../persist.service";
import {FlashService} from "../common/flash.service";

// For author projects, use this to skip the first fake step.
@Pipe({
  name: 'onlyRealStep'
})
export class OnlyRealStepPipe implements PipeTransform {
  transform(steps: Array<any>): Array<any> {
    if (!steps) {
      return steps;  // If data not yet defined, don't crap out.
    }

    // Return all but first step.
    return steps.slice(1);
  }
}

@Component({
  selector: 'app-home-page',
  templateUrl: './admin-home-page.component.html',
  styles: []
})
export class AdminHomePageComponent implements OnInit {

  newProject: any = {};
  playProjects: Array<IProject>;
  authors: Array<IAuthorProject>;  // this is the new one
  remoteProjects: any;
  //noinspection JSUnusedGlobalSymbols
  templates = ['blank', 'p5js', 'vuejs'];  // TODOfuture: generalize. And keep in sync with AuthorService's loadCodeTemplate

  // Make authService public since html template uses it.
  //noinspection JSUnusedLocalSymbols,JSUnusedGlobalSymbols
  constructor(private projectService: ProjectService, private authorService: AuthorService, private persistService: PersistService, private eventService: EventService, private router: Router, public authService: AuthService, private flashService: FlashService) {
  }

  ngOnInit() {
    this.loadLocalProjects();
    //noinspection JSIgnoredPromiseFromCall
    this.loadRemoteProjects();
  }

  private loadLocalProjects() {
    this.newProject = {};  // Clear out old values.
    this.projectService.getAllProjects().then(localProjects => {
      this.playProjects = localProjects;
    });

    this.authorService.getAllProjects().then(authors => {
      this.authors = authors;
    });
  }

  private loadRemoteProjects() {
    return this.authorService.getRemoteProjects().then(projects => {
      this.remoteProjects = projects;
    });
  }

  // BEGIN new authorService
  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  startProject() {
    this.authorService.createProjectForAuthoring(this.newProject).then(() => {
      this.eventService.recordEvent('start-author-project', null, this.newProject);
      this.loadLocalProjects();
    });
  }

  //noinspection JSUnusedGlobalSymbols
  playLocalAuthorProject(authorProjectId) {
    return this.persistService.playLocalAuthorProject(authorProjectId).then(projectId => {
      return this.router.navigate(['/play/' + projectId + '/step/1']);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  uploadAuthorProject(projectId) {
    return this.authorService.uploadProject(projectId).then(() => {
      // Refresh project list.
      this.flashService.tellSuccessImmediately('Project uploaded');
      this.loadLocalProjects();  // Load local to show new server_id
      return this.loadRemoteProjects();
    });
  }

  downloadAuthorProject(projectId) {
    return this.authorService.loadLocalProjectForTransport(projectId).then((strippedProject) => {
      let text = JSON.stringify(strippedProject, null, 2);
      let base64Encoded = btoa(text);
      let uri = 'data:application/json;charset=utf-8;base64,' + base64Encoded;
      let link = document.createElement("a");
      link.href = uri;
      (link as any).style = "visibility:hidden";
      let fileName = /*'project-' +*/ strippedProject.title;
      link.download = fileName + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  copyAuthorProject(projectId) {
    return this.authorService.loadLocalProjectForTransport(projectId).then((strippedProject) => {
      let title = prompt('Name of copy of project', 'Copy of ' + strippedProject.title);
      if (title) {
        strippedProject.title = title;
        return this.authorService.saveProject(strippedProject).then(() => {
          this.flashService.tellSuccessImmediately('Project copied');
          this.loadLocalProjects();  // Show new data.
        });
      }
    });
  }

  downloadPlayProject(projectId) {
    return this.projectService.loadLocalProjectForTransport(projectId).then((strippedProject) => {
      let text = JSON.stringify(strippedProject, null, 2);
      let base64Encoded = btoa(text);
      let uri = 'data:application/json;charset=utf-8;base64,' + base64Encoded;
      let link = document.createElement("a");
      link.href = uri;
      (link as any).style = "visibility:hidden";
      let fileName = 'play-project-' + strippedProject.title;
      link.download = fileName + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  downloadRemoteAuthorProjects() {
    return this.authorService.getRemoteProjectsComplete().then((projects) => {
      let text = JSON.stringify(projects, null, 2);
      let base64Encoded = btoa(text);
      let uri = 'data:application/json;charset=utf-8;base64,' + base64Encoded;
      let link = document.createElement("a");
      link.href = uri;
      (link as any).style = "visibility:hidden";
      let fileName = 'author-projects';
      link.download = fileName + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  playRemoteProject(remoteProject) {
    return this.persistService.playRemoteProject(remoteProject).then(projectId => {
      return this.router.navigate(['/play/' + projectId + '/step/1']);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  deletePlayProject(project) {
    if (confirm("Are you sure you want to delete this project?")) {
      this.projectService.deleteProject(project.id).then(() => {
        // Instead of reloading page, just reload data.
        this.loadLocalProjects();
      });
    }
    return false;  // Needed to prevent redirecting.
  }

}
