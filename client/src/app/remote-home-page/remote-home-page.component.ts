import {Component, OnInit, ViewChild} from '@angular/core';
import {AuthorService} from "../author/author.service";
import {ProjectService} from "../project/project.service";
import {AuthService} from "../common/auth.service";
import {PersistService} from "../persist.service";
import {EventService} from "../project/event.service";
import {Router} from "@angular/router";
import {ProjectTreeComponent} from "../common/project-tree/project-tree.component";
import {ProjectTreeService} from "../common/project-tree.service";
import {FlashService} from "../common/flash.service";

declare let jQuery: any;

@Component({
  selector: 'app-remote-home-page',
  templateUrl: './remote-home-page.component.html',
  styles: []
})
export class RemoteHomePageComponent implements OnInit {
  playProjects: any;
  authorProjects: any;

  authorProjectsStartable: any;
  authorProjectsNotStartable: any;

  currentView: string = 'TREEVIEW';
  selectedProject: any;

  @ViewChild('projectTreeId') projectTreeComponent: ProjectTreeComponent;

  voteForm = {messageText: ''};
  showVoteForm = false;

  // Make authService public for html template.
  constructor(private projectService: ProjectService, private authorService: AuthorService, private persistService: PersistService, private eventService: EventService, private router: Router, public authService: AuthService, private projectTreeService: ProjectTreeService, private flashService: FlashService) {
  }

  ngOnInit() {
    //noinspection JSIgnoredPromiseFromCall
    this.loadProjects();
  }

  private loadProjects() {
    return this.projectService.getRemoteProjects().then(playProjects => {
      return this.authorService.getRemoteProjects().then(authorProjects => {

        this.projectTreeService.initData(playProjects, authorProjects);  // ugly: this needs to come before below

        // // Index local projects.
        let playProjectIndex = {};
        playProjects.forEach(function (playProject) {
          playProjectIndex[String(playProject.server_driver_id)] = playProject;
        });

        // // Remove if author project is already started.
        // authorProjects = authorProjects.filter(function (authorProject) {
        //   let remoteProjectId = String(authorProject.id);
        //   return !playProjectIndex[remoteProjectId];
        // });

        this.authorProjectsStartable = [];
        this.authorProjectsNotStartable = [];
        authorProjects.forEach(function (authorProject) {
          let remoteProjectId = String(authorProject.id);
          let userAlreadyDoing = playProjectIndex[remoteProjectId];
          if (userAlreadyDoing) {
            // Skip project already being worked on.
          } else {
            if (this.projectTreeService.canStart(authorProject.title)) {
              this.authorProjectsStartable.push(authorProject);
            } else {
              this.authorProjectsNotStartable.push(authorProject);
            }
          }
        }, /*this=*/this);

        this.playProjects = playProjects;
        this.authorProjects = authorProjects;
      });
    });
  }

  playRemoteProject(remoteProject) {
    jQuery('#projectModalPopup').find('.close').click();
    return this.persistService.playRemoteProject(remoteProject).then(projectId => {
      return this.router.navigate(['/play/' + projectId + '/step/1']);
    });
  }

  // Send user to last step in project. Safer than using .currentStep, which at end is > last step.
  resumeRemoteProject(remoteProject) {
    jQuery('#projectModalPopup').find('.close').click();
    /*return*/
    this.persistService.resumeRemotePlayProject(remoteProject).then(project => {
      // let stepNum = remoteProject.current_step;
      let stepNum = project.steps.length;
      this.eventService.recordEvent('resume-project', project.id, stepNum);
      return this.router.navigate(['/play/' + project.id + '/step/' + stepNum]);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  restartProject(remoteProject) {
    if (confirm("Are you sure you want to restart this project? Any changes you made in it will be lost.")) {
      jQuery('#projectModalPopup').find('.close').click();
      return this.persistService.restartRemotePlayProject(remoteProject).then(projectId => {
        return this.router.navigate(['/play/' + projectId + '/step/1']);
      });
    }
  }

  // Begin new tree support.
  switchView(viewName) {
    this.currentView = viewName;
  }

  redrawProjectTree() {
    this.projectTreeComponent.redrawNodes();
  }

  projectWasSelected(selectedProject) {

    // Shove a flag in for UI.
    if (selectedProject.kind === 'DNE') {
      selectedProject.canStart = false;
    } else {
      selectedProject.canStart = this.projectTreeService.canStart(selectedProject.project.title);
    }

    this.selectedProject = selectedProject;

    // Display popup.
    this.showVoteForm = false;
    jQuery('#projectModalPopup').modal();
  }

  // Begin vote support.
  //noinspection JSMethodCanBeStatic
  showVote() {
    // Display form.
    this.showVoteForm = true;
    return false;  // Don't follow link.
  }

  submitVote() {
    jQuery('#projectModalPopup').find('.close').click();

    this.voteForm.messageText = this.voteForm.messageText.trim();

    // Construct composite message.
    let messageToSend = 'I want you to make project: ' + this.selectedProject.project.title;
    if (this.voteForm.messageText) {
      messageToSend += '\n' + this.voteForm.messageText;
    }

    // Submit message.
    this.authService.submitContact(messageToSend).then(() => {
      // Clear out form in case they send another message.
      this.voteForm.messageText = '';

      // Tell them good job.
      this.flashService.tellSuccessImmediately('Thank you for your vote.');
    });
  }

  //noinspection JSMethodCanBeStatic
  cancelVote() {
    jQuery('#projectModalPopup').find('.close').click();
  }

}
