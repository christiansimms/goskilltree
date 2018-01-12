import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {AuthorService, IAuthorProject} from "../author.service";
import {getAutoPromptForDelta} from "../../project/ast/prompt";
import {FlashService} from "../../common/flash.service";
import {calcFSForAuthor} from "../author-calc";

@Component({
  selector: 'app-author-edit-page',
  templateUrl: './author-edit-page.component.html',
  styles: []
})
export class AuthorEditPageComponent implements OnInit {
  project: IAuthorProject;
  finalFs: any;
  projectPlan: any;
  stepAutoPrompt;

  constructor(private route: ActivatedRoute, private authorService: AuthorService, private flashService: FlashService) {
    this.stepAutoPrompt = [];
  }

  //noinspection JSUnusedGlobalSymbols
  ngOnInit() {
    this.route.params.subscribe((params: Params) => {
      let projectId = +params['projectId'];
      this.authorService.loadProject(projectId).then(project => {
        this.project = project;

        // Store prompt for each real step, not on it, because we will be saving it later.
        let allButFirstSteps = this.project.steps.slice(1);
        allButFirstSteps.forEach(step => {
          this.stepAutoPrompt.push(getAutoPromptForDelta(step.delta));
        });

        // Calculate project.
        let lastStepNum = this.project.steps.length - 1;  // no need to +1 b/c fake step at beginning
        [, this.finalFs] = calcFSForAuthor(this.project, lastStepNum);
        this.projectPlan = this.finalFs.maybeFindFile('db/todo.json');
      });
    });
  }

  //noinspection JSUnusedGlobalSymbols
  addStepAfter(stepNum) {
    let newStep = {description: '', delta: []};
    this.project.steps.splice(stepNum + 1, 0, newStep);
    this.refreshSaveProject();
    this.flashService.tellSuccessImmediately('Step added');
    return false;
  }

  //noinspection JSUnusedGlobalSymbols
  deleteStep(stepNum) {
    if (confirm("Are you sure you want to delete this step?")) {
      this.project.steps.splice(stepNum, 1);
      this.refreshSaveProject();
      this.flashService.tellSuccessImmediately('Step removed');
    }
    return false;
  }

  //noinspection JSUnusedGlobalSymbols
  downloadStepFiles(stepNum) {
    let [, fs] = calcFSForAuthor(this.project, +stepNum);

    let text = JSON.stringify(fs, null, 2);
    let base64Encoded = btoa(text);
    let uri = 'data:application/json;charset=utf-8;base64,' + base64Encoded;
    let link = document.createElement("a");
    link.href = uri;
    (link as any).style = "visibility:hidden";
    let fileName = 'fs-' + this.project.title + '-step-' + stepNum;
    link.download = fileName + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  //noinspection JSUnusedGlobalSymbols
  moveDelta(stepNumParam, srcDelta, patchIndex) {
    let defaultStepNum = +stepNumParam + 1;
    let stepName = prompt('What step to move to?', '' + defaultStepNum);
    if (stepName != null) {
      let stepNum = +stepName;
      let step = this.project.steps[stepNum];
      if (!step) {
        alert('Sorry, I cannot find that step.');
        return false;
      }
      let delta = step.delta;

      let removePatch = srcDelta.splice(patchIndex, 1)[0];
      delta.push(removePatch);
      this.refreshSaveProject();
    }
    return false;
  }

  refreshSaveProject() {
    this.project.steps = this.project.steps.slice();  // force angular to detect array change
    this.authorService.saveProject(this.project);
  }

  //noinspection JSUnusedGlobalSymbols
  deleteProject() {
    if (confirm("Are you sure you want to delete this entire project?")) {
      this.authorService.deleteProject(this.project.id).then(() => {
        this.flashService.tellSuccess('Project deleted', '/admin');
      });
    }
    return false;  // Needed to prevent redirecting.
  }
}

