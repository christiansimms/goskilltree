import {Injectable} from '@angular/core';
import {AuthorService, IAuthorProject} from "./author/author.service";
import {IProject, ProjectService} from "./project/project.service";

// Unify local (Project) and remote (Author) databases.
@Injectable()
export class PersistService {

  constructor(private projectService: ProjectService, private authorService: AuthorService) {
  }

  // Download the remote project, save it locally, then play it.
  playRemoteProject(partialRemoteProject) {
    return this.authorService.ensureRemoteProjectSavedLocally(partialRemoteProject.id).then(authorProject => {
      return this.projectService.playAuthorProject(authorProject);
    });
  }

  playLocalAuthorProject(projectId) {
    return this.authorService.loadProject(projectId).then(authorProject => {
      return this.projectService.playAuthorProject(authorProject);
    });
  }

  // Make sure the remote play project, and its corresponding author project, are loaded. Return the local id of the play project.
  resumeRemotePlayProject(partialRemotePlayProject): Promise<IProject> {
    return this.authorService.ensureRemoteProjectSavedLocally(partialRemotePlayProject.server_driver_id).then(authorProject => {
      return this.projectService.ensureRemotePlayProjectSavedLocally(partialRemotePlayProject, authorProject).then(playProject => {
        return playProject;
      });
    });
  }

  // Make sure we have local copy, then fix it up.
  restartRemotePlayProject(partialRemotePlayProject) {
    return this.authorService.ensureRemoteProjectSavedLocally(partialRemotePlayProject.server_driver_id).then(authorProject => {
      return this.projectService.ensureRemotePlayProjectSavedLocally(partialRemotePlayProject, authorProject).then(playProject => {
        return this.projectService.restartPlayProject(<IAuthorProject><any>authorProject, <IProject><any>playProject); // add cast b/c dont feel like fixing w/param types right now
      });
    });

  }
}
