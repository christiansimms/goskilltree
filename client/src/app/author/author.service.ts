import {Injectable} from '@angular/core';
import Dexie from 'dexie';
import {
  plnkr_blank_template_json, plnkr_p5js_template_json,
  plnkr_vuejs_template_json
} from "../project/test-ast-page/tutor-content";
import {IJsonPatch, cleanCopyDelta} from "../project/ast/astdiff";
import {ensureNoExtraFields, validateField} from "../common/type-helper";
import {HttpService} from "../common/http.service";


// NOTE: keep type definitions like IAuthorProject in sync with validateAuthorProjectSchema.
export interface IAuthorProject {
  id?: number;
  server_project_id?: string;  // Local-only column: id on server-side
  title: string;
  description: string;
  template: string;
  tags: any;
  steps: IAuthorStep[];
  // Fields only added after uploading to server, so they're all optional:
  owner?: string;
  version?: number;
  created_date?: string;
  updated_date?: string;
}

export interface IDeltaEntry {
  filename: string;
  diffs: IJsonPatch[];
}

export interface IAuthorStep {
  description: string;
  delta: IDeltaEntry[];
}

export interface IAuthorFirstStep /*extends IAuthorStep*/
{
  description: string;
  file_system: any;  // this is only on the first, hidden step.
}

class AuthorDatabase extends Dexie {
  authors: Dexie.Table<IAuthorProject, number>;

  constructor() {
    super("AuthorDatabase");
    this.version(1).stores({
      authors: "++id, title, &server_project_id",  // Make server_project_id unique
    });
  }
}

// Validate that only required fields are present.
// Too bad typescript doesn't let you do this using its interfaces.
export function validateAuthorProjectSchema(project: IAuthorProject): string[] {

  // Validate top level.
  let problems = [];

  function addProblem(problem: string) {
    if (problem) {
      problems.push(problem);
    }
  }

  // NOTE: keep type definitions like IAuthorProject in sync with validateAuthorProjectSchema.
  addProblem(validateField(project, 'id', 'number', /*optional=*/true));
  addProblem(validateField(project, 'server_project_id', 'string', /*optional=*/true));  // This is an appengine guid. You could be more strict.
  addProblem(validateField(project, 'title', 'string'));
  addProblem(validateField(project, 'description', 'string', /*optional=*/true));  // When create new project, nothing there.
  addProblem(validateField(project, 'template', 'string'));
  addProblem(validateField(project, 'tags', 'string[]', /*optional=*/true));  // When create new project, nothing there.
  // Fields only added after uploading to server, so they're all optional:
  addProblem(validateField(project, 'owner', 'string', /*optional=*/true));
  addProblem(validateField(project, 'version', 'number', /*optional=*/true));
  addProblem(validateField(project, 'created_date', 'string', /*optional=*/true));
  addProblem(validateField(project, 'updated_date', 'string', /*optional=*/true));

  // Validate first step.
  let firstStep: IAuthorFirstStep = <IAuthorFirstStep><any>project.steps[0];  // double cast!
  addProblem(validateField(firstStep, 'description', 'string'));
  addProblem(validateField(firstStep, 'file_system', 'file_system'));
  addProblem(ensureNoExtraFields(firstStep, ['description', 'file_system']));

  // Validate other steps.
  for (let step of project.steps.slice(1)) {
    addProblem(validateField(step, 'description', 'string'));
    addProblem(validateField(step, 'delta', 'DeltaEntry[]'));
    addProblem(ensureNoExtraFields(step, ['description', 'delta']));
  }

  // Make sure nothing left.
  addProblem(ensureNoExtraFields(project, ['id', 'server_project_id', 'title', 'description', 'template', 'tags', 'steps', 'owner', 'version', 'created_date', 'updated_date']));

  // Return result.
  return problems;
}

export function cleanCopyAuthorProject(project: IAuthorProject): IAuthorProject {
  // Shallow copy fields.
  let out: IAuthorProject = Object.assign({}, project);

  // Now do steps.
  out.steps = project.steps.map((step, index) => {
    if (index === 0) {
      // First step.
      let firstStep = <IAuthorFirstStep><any>step;
      let newStep = <IAuthorFirstStep> {'description': firstStep.description, 'file_system': firstStep.file_system};
      return <IAuthorStep><any>newStep;
    } else {
      // Other steps.
      return <IAuthorStep> {'description': step.description, 'delta': cleanCopyDelta(step.delta)};
    }
  });

  return out;
}

@Injectable()
export class AuthorService {

  private db: AuthorDatabase;
  private authors: Dexie.Table<IAuthorProject, number>;

  constructor(private http: HttpService) {
    this.db = new AuthorDatabase();
    this.authors = this.db.authors;
  }

  //noinspection JSMethodCanBeStatic
  loadCodeTemplate(project): any {
    if (project.template === 'blank') {
      return Promise.resolve(plnkr_blank_template_json);
    } else if (project.template === 'p5js') {
      return Promise.resolve(plnkr_p5js_template_json);
    } else if (project.template === 'vuejs') {
      return Promise.resolve(plnkr_vuejs_template_json);
    } else {
      throw new Error('Did not recognize template: ' + project.template);
    }
  }

  //noinspection JSUnusedGlobalSymbols
  getAllProjects() {
    return this.authors.toArray();  // TODOfuture: only load certain columns
  }

  loadProject(projectId: number): Dexie.Promise<IAuthorProject> {
    return this.authors.get(projectId);
  }

  saveProject(origProject: IAuthorProject): Dexie.Promise<number> {
    let project = cleanCopyAuthorProject(origProject);
    let problems = validateAuthorProjectSchema(project);
    if (problems.length > 0) {
      return Dexie.Promise.reject('Project does not validate: ' + problems.join('\n'));
    } else {
      return this.authors.put(project);
    }
  }

  deleteProject(projectId: number): Dexie.Promise<void> {
    return this.authors.delete(projectId);
  }

  // Create empty project and return its id.
  createProjectAndFirstStep(project): Promise<number> {
    return this.loadCodeTemplate(project).then(fileSystem => {

      // Create step 0 and 1.
      project.steps = [
        {description: '', file_system: fileSystem},
        {description: '', delta: []},
      ];

      return this.authors.add(project);
    });
  }

  createProjectForAuthoring(project): Promise<number> {
    return this.createProjectAndFirstStep(project);
  }

  saveRemoteProjectLocally(remoteProject): Promise<IAuthorProject> {
    // Play with ids.
    let project = remoteProject;
    project.server_project_id = remoteProject.id;
    delete project.id;  // Let dexie.js allocate a new local id.

    return this.authors.add(project).then(projectId => {
      return this.loadProject(projectId);
    });
  }

  //noinspection JSMethodCanBeStatic
  makeNextStepNoSave(project: IAuthorProject): void {
    project.steps.push({description: '', delta: []});
  }

  // Load local project for either upload or download.
  // Strip out things only needed for performance.
  loadLocalProjectForTransport(projectId): Dexie.Promise<IAuthorProject> {
    // Load project and steps, then modify them.
    return this.loadProject(projectId).then((project: IAuthorProject) => {

      // Cleanup project record.
      delete project.id;
      delete project.server_project_id;

      // Cleanup steps.
      project.steps.forEach(step => {

        // Clear out delta. Some steps (like step #0) don't have a delta.
        if (step.delta) {
          step.delta.forEach((deltaEntry: IDeltaEntry) => {
            deltaEntry.diffs.forEach((patch: IJsonPatch) => {
              // Clear out AST field.
              delete patch.value;
            });
          });
        }
      });

      return project;
    });
  }

  // Begin remote support.
  getRemoteProjects() {
    return this.http.get('/api/data/authorproject');
  }

  getRemoteProjectsComplete() {
    return this.http.get('/api/data/authorprojectcomplete');
  }

  getRemoteProject(projectId) {
    return this.http.get('/api/data/authorproject/' + projectId);
  }

  uploadProject(projectId: number) {
    return this.loadLocalProjectForTransport(projectId).then(strippedProject => {
      return this.http
        .post('/api/data/authorproject', strippedProject)
        .then(serverProjectPartial => {
          // Store remote key in local project.
          return this.db.transaction('rw', this.db.authors, () => {
            return this.authors.get(projectId).then(localProject => {
              localProject.server_project_id = serverProjectPartial['id'];
              return this.saveProject(localProject);
            });
          });
        });
    });
  }

  ensureRemoteProjectSavedLocally(remoteProjectId) {
    return this.authors.where('server_project_id').equals(remoteProjectId).toArray().then(entries => {
      if (entries.length === 1) {
        return entries[0];
      } else {
        // Not found, need to download.
        return this.getRemoteProject(remoteProjectId).then(remoteProject => {
          return this.saveRemoteProjectLocally(remoteProject);
        });
      }
    });
  }

  getRemoteProjectStrippedForDownload(removeProjectId) {
    return this.getRemoteProject(removeProjectId).then((remoteProject) => {
      // Filter certain fields so that diff'ing is easier.
      delete remoteProject.id;
      delete remoteProject.owner;
      delete remoteProject.created_date;
      delete remoteProject.updated_date;
      return remoteProject;
    });
  }

  /*
  uploadNewVersion(projectTitle, file) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post('/api/data/authorproject_by_title/' + projectTitle, formData)
      .then(() => {
      });
  }
  */

}
