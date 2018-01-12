import {Injectable} from '@angular/core';
import {EventService} from "./event.service";
import {IProject} from "./project.service";

@Injectable()
export class PlayService {

  // Current project.
  project: IProject = null;
  stepNum: number;

  // Current hint level.
  hintLevel: number = 0;

  constructor(private eventService: EventService) {
  }

  useProject(project: IProject, stepNum: number) {
    // Reset hint level if we're going to a different project.
    let projectIsSame = project && this.project && project.id === this.project.id;
    // console.log('useProject projectIsSame: ', projectIsSame, project, this.project);
    if (projectIsSame) {
      // Pass.
    } else {
      // Project changed, reset level.
      this.hintLevel = 0;
    }
    this.project = project;
    this.stepNum = stepNum;
  }

  doHelp() {
    if (this.hintLevel > 0) {
      // Turn it off.
      this.hintLevel = 0;
    } else {
      // Turn it on.
      this.eventService.recordEvent('help', this.project.id, null);
      this.hintLevel = 1;
    }
  }

  doMoreHints() {
    this.eventService.recordEvent('help-more', this.project.id, null);
    this.hintLevel += 1;
  }

  hideHelp() {
    this.hintLevel = 0;
    return false;
  }

  hideMoreHints() {
    this.hintLevel = 1;
    return false;
  }

  isLatestStep() {
    let lastStepNum = this.project.steps.length;  // this is 1-based
    return this.stepNum === lastStepNum;
  }
}
