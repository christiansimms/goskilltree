import {Injectable} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import Dexie from 'dexie';
import {EventService} from "./event.service";
import {IAuthorFirstStep, IAuthorProject, IDeltaEntry} from "../author/author.service";
import {deepCopy} from "../common/jsutils";
import {cleanCopyDelta} from "./ast/astdiff";
import {HttpService} from "../common/http.service";
import {AuthService} from "../common/auth.service";

// Same as IAuthorProject except also has: driver_id and file system.
export interface IProject {
  id?: number;
  server_project_id?: string;  // Local-only column: id on server-side
  driver_id: number;  // Local-only column.
  server_driver_id: string;
  title: string;
  description: string;
  template: string;
  tags: any;
  steps: IStep[];
  latest_file_system: any;
  current_step: number;  // Only needed when displaying.
  total_steps: number;  // Only needed when displaying.
}

export interface IStep {
  delta: IDeltaEntry[];
}

export interface IGenericProject {
  steps: IStep[];
}

// Use IGenericStep for places that support both IStep and IAuthorStep.
export interface IGenericStep {
  delta: IDeltaEntry[];
}

class PlayDatabase extends Dexie {
  projects: Dexie.Table<IProject, number>;

  constructor() {
    super("PlayDatabase");
    this.version(1).stores({
      projects: "++id, title, &server_driver_id",  // Index server_driver_id so we can search by it, make it unique.
    });
  }
}

export function cleanCopyPlayProject(project: IProject): IProject {
  // Shallow copy fields.
  let out: IProject = Object.assign({}, project);

  // Now do steps.
  out.steps = project.steps.map(step => {
    return <IStep> {'delta': cleanCopyDelta(step.delta)};
  });

  return out;
}

@Injectable()
export class ProjectService {

  private db: PlayDatabase;
  private projects: Dexie.Table<IProject, number>;

  constructor(private http: HttpService, private eventService: EventService, private authService: AuthService) {
    this.db = new PlayDatabase();
    this.projects = this.db.projects;  // table('projects');
  }

  //noinspection JSUnusedGlobalSymbols
  getAllProjects() {
    return this.projects.toArray();
  }

  saveProject(origProject: IProject, upload: boolean): Dexie.Promise<number> {
    let project = cleanCopyPlayProject(origProject);
    if (upload) {
      if (project.server_driver_id) {
        console.log('saveProject uploading project');
        //noinspection JSIgnoredPromiseFromCall
        this.http.post('/api/data/playproject/' + project.server_project_id, project);
      } else {
        console.log('saveProject skipping local-only project');
      }
    }
    return this.projects.put(project);
  }

  createProjectRemotely(project: IProject) {
    if (project.server_driver_id) {
      console.log('createProjectRemotely uploading project');
      return this.http.post('/api/data/playproject', project);
    } else {
      console.log('createProjectRemotely skipping local-only project');
      return Promise.resolve({id: null});
    }
  }

  saveRemoteProjectLocally(authorProject: IAuthorProject, remoteProject): Promise<IProject> {
    // Play with ids.
    let project = remoteProject;
    project.server_project_id = remoteProject.id;
    delete project.id;  // Let dexie.js allocate a new local id.

    // Store local link.
    project.driver_id = authorProject.id;

    return this.projects.add(project).then(projectId => {
      return this.loadProject(projectId);
    });
  }

  // Update local project with newer remote version. Then return latest local project.
  updateLocalProjectWithRemote(localPlayProject: IProject, remotePlayProject: IProject) {
    localPlayProject.steps = remotePlayProject.steps;
    localPlayProject.latest_file_system = remotePlayProject.latest_file_system;
    localPlayProject.current_step = remotePlayProject.current_step;
    // No point in uploading right now, no change yet.
    return this.saveProject(localPlayProject, false).then(projectId => {
      return this.loadProject(projectId);
    });
  }

  // Save this step and make a new one. Return promise returning the project id.
  makeNextStep(project: IProject): Dexie.Promise<number> {
    let newStep: IStep = {
      delta: []
    };
    project.steps.push(newStep);
    project.current_step += 1;
    return this.saveProject(project, false);
  }

  markProjectAsDone(project: IProject) {
    return this.makeNextStep(project);
    // project.current_step += 1;
    // return this.saveProject(project, false);
  }

  //noinspection JSUnusedGlobalSymbols
  loadProject(projectId: number): Promise<IProject> {
    return this.projects.get(projectId);
  }

  playAuthorProject(authorProject: IAuthorProject): Promise<number> {
    this.eventService.recordEvent('start-play-project', null, authorProject);

    // Define steps.
    let firstAuthorStep: IAuthorFirstStep = <IAuthorFirstStep><any>authorProject.steps[0];  // double cast!
    let step0: IStep = {
      delta: []
    };

    // Create project from author.
    let project: IProject = {
      driver_id: authorProject.id,
      server_driver_id: authorProject.server_project_id,
      title: authorProject.title,
      description: authorProject.description,
      template: authorProject.template,
      tags: authorProject.tags,
      steps: [step0],
      latest_file_system: deepCopy(firstAuthorStep.file_system),
      current_step: 1,
      total_steps: authorProject.steps.length - 1  // -1 because of extra step at beginning
    };

    return this.projects.add(project).then(() /*projectId*/ => {
      // Now that project is created in Dexie, save it remotely.
      return this.createProjectRemotely(project).then(partialRemoteProject => {
        project.server_project_id = partialRemoteProject.id;

        return this.projects.put(project);
      });
    });
  }

  // Assume it's saved properly, so update it.
  restartPlayProject(authorProject: IAuthorProject, project: IProject): Promise<number> {
    // Define steps.
    let firstAuthorStep: IAuthorFirstStep = <IAuthorFirstStep><any>authorProject.steps[0];  // double cast!
    let step0: IStep = {
      delta: []
    };

    project.steps = [step0];
    project.latest_file_system = deepCopy(firstAuthorStep.file_system);
    project.current_step = 1;
    // return this.projects.put(project);
    return this.saveProject(project, true);
  }

  deleteProject(projectId: number) {
    // No longer deleting events associated w/this project.
    return this.projects.delete(projectId);
  }

  // Load local project for either upload or download.
  // Strip out things only needed for performance.
  //noinspection JSUnusedGlobalSymbols
  loadLocalProjectForTransport(projectId): Promise<any> {
    // Load project and steps, then modify them.
    return this.loadProject(projectId).then((project) => {

      // Cleanup project record.
      delete project.id;

      return project;
    });
  }

  // Begin remote support.
  getRemoteProjects() {
    // This is called on the home page, and we don't want it to fail if they haven't logged in yet.
    if (this.authService.isLoggedIn()) {
      return this.http.get('/api/data/playproject');
    } else {
      return Promise.resolve([]);
    }
  }

  getRemoteProjectsComplete() {
    return this.http.get('/api/data/playprojectcomplete');
  }

  getRemoteProject(projectId) {
    return this.http.get('/api/data/playproject/' + projectId);
  }

  ensureRemotePlayProjectSavedLocally(partialRemotePlayProject, authorProject: IAuthorProject) {
    return this.projects.where('server_driver_id').equals(authorProject.server_project_id).toArray().then(localPlayProjects => {
      return this.getRemoteProject(partialRemotePlayProject.id).then(remotePlayProject => {
        if (localPlayProjects.length > 0) {
          let localPlayProject = localPlayProjects[0];  // TODOfuture: check timestamp
          console.log('ensureRemotePlayProjectSavedLocally deciding which play project to use, local, remote: ', localPlayProject.steps.length, remotePlayProject.steps.length);
          if (remotePlayProject.steps.length > localPlayProject.steps.length) {
            // More steps in remote than local: use remote.
            console.log('ensureRemotePlayProjectSavedLocally using remote project');
            return this.updateLocalProjectWithRemote(localPlayProject, remotePlayProject);
          } else {
            // Use local.
            console.log('ensureRemotePlayProjectSavedLocally using local project');
            return localPlayProject;
          }
        } else {
          // No local projects, need to download.
          return this.saveRemoteProjectLocally(authorProject, remotePlayProject);
        }
      });
    });
  }

}
