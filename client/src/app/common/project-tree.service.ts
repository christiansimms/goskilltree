import {Injectable} from '@angular/core';

// 2017-05-16: temp. hardcode project dependencies.
let all = [
  ['JavaScript - Intro', 'p5.js - Intro'],
  ['p5.js - Intro', 'p5.js - Paint'],
  ['p5.js - Paint', 'Shooter Game, Add Undo / Redo'],
  // ['p5.js - Paint', 'Wall Game, Shooter Game'],
  // ['Vue.js - Intro', 'Vue.js - Component'],
  // ['Vue.js - Component', 'Twitter Clone'],
  // ['Vue.js - Component', 'CRUD App'],
  // ['CRUD App', 'Twitter Clone, Reddit Clone'],
];


@Injectable()
export class ProjectTreeService {
  playProjects: any;
  authorProjects: any;
  authorProjectIndex: any;
  playProjectIndex: any;

  constructor() {
  }

  //noinspection JSMethodCanBeStatic
  getAllProjects() {
    return all;
  }

  initData(playProjects: any, authorProjects: any) {
    this.playProjects = playProjects;
    this.authorProjects = authorProjects;

    // Index projects. By *title*, at the moment -- easier than keep GUIDs in sync.
    this.authorProjectIndex = {};
    this.authorProjects.forEach(authorProject => {
      if (this.authorProjectIndex[authorProject.title]) {
        alert('Warning: multiple author projects found with same title: ' + authorProject.title);
      }
      this.authorProjectIndex[authorProject.title] = authorProject;
    }, this);
    this.playProjectIndex = {};
    this.playProjects.forEach(playProject => {
      this.playProjectIndex[playProject.title] = playProject;
    }, this);

  }

  hasCompleted(projectName): boolean {
    let project = this.playProjectIndex[projectName];
    if (project) {
      return project.current_step > project.total_steps;
    } else {
      return false;
    }
  }

  // Assume either 0 or 1 dependency.
  canStart(projectName): boolean {
    if (projectName === 'p5.js - Paint') {
      return this.hasCompleted('p5.js - Intro');
    } else if (projectName === 'p5.js - Intro') {
      return this.hasCompleted('JavaScript - Intro');
    } else if (projectName === 'JavaScript - Intro') {
      return true;
    } else {
      // Did not recognize.
      throw new Error('canStart did not recognize: ' + projectName);
    }
  }

}
