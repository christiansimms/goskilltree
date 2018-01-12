import {Component, Input, OnInit} from '@angular/core';
import {findTopItem, PlayPlanMgr, visitProjectPlanRec} from "../../project/project-plan";
import {IAuthorFirstStep, IAuthorStep} from "../author.service";
import {FileSystemContainer} from "../../project/ast/utils";
import {deepCopy} from "../../common/jsutils";
// import {IAuthorProject} from "../author.service";

@Component({
  selector: 'app-author-summary-project-plan',
  template: `
    <div class="row">
      <div class="col-md-6">
        <div *ngFor="let problem of problems">PROBLEM: {{problem}}</div>
      </div>
    </div>
    <div class="row">
      <div class="col-md-6">
        <app-author-summary-project-table [todo]="projectPlan" [todoToStep]="todoToStep"
                                          [project]="project"></app-author-summary-project-table>
      </div>
      <div class="col-md-6">
        <br/><br/><br/><br/><br/>
        <h4>Skill Summary</h4>
        <!--{{countList|json}}-->
        <table class="table">
          <thead>
          <tr>
            <th>Name</th>
            <th>Count</th>
          </tr>
          </thead>
          <tbody>
          <tr *ngFor="let count of countList">
            <td>{{count[0]}}</td>
            <td>{{count[1]}}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: []
})
export class AuthorSummaryProjectPlanComponent implements OnInit {

  @Input()
  projectPlan: any;
  @Input()
  project: any;  // IAuthorProject;
  countList: any;
  todoToStep: any;
  problems: string[];

  constructor() {
  }

  ngOnInit() {
    if (this.projectPlan) {
      this.calcSkills();
      this.calcSteps();
    }
  }

  calcSkills() {
    let counts = {};

    function collectSkills(item) {
      if (item.skills) {
        item.skills.forEach(skill => {
          counts[skill] = !counts[skill] ? 1 : (counts[skill] + 1);
        });
      }
    }

    visitProjectPlanRec(this.projectPlan, collectSkills);

    // Convert to list.
    let countList = [];
    //noinspection TsLint
    for (let key in counts) {
      let value = counts[key];
      countList.push([key, value]);
    }

    // Sort the list.
    countList.sort(function (a, b) {
      return a[0].localeCompare(b[0]);  // First entry is name.
    });

    // Store it.
    this.countList = countList;
  }

  private storeItemId(itemId, stepNum) {
    if (!this.todoToStep[itemId]) {
      this.todoToStep[itemId] = [];
    }
    this.todoToStep[itemId].push(stepNum);
  }

  // Put steps into project plan.
  // To support multiple steps on one project plan step, we need to calculate the project plan for each step.
  calcSteps() {
    this.problems = [];
    this.todoToStep = {};

    // This is the live filesystem. This code is similar to validateAuthorProjectChanges().
    // Important: use copy of file system, otherwise you're changing the first step's file system.
    let firstStep: IAuthorFirstStep = <IAuthorFirstStep><any>this.project.steps[0];
    let fs = new FileSystemContainer(deepCopy(firstStep.file_system));

    // Compute requested steps.
    this.project.steps.slice(1).forEach((step: IAuthorStep, index: number) => {
      // Compute step.
      let previousFileSystem = deepCopy(fs.fileSystem);
      let prevfs = new FileSystemContainer(previousFileSystem);
      fs.applyAndValidateStep(step);

      let stepNum = index + 1;
      let playPlanMgr = new PlayPlanMgr(step, prevfs);

      if (playPlanMgr.activePlanItemId) {
        // They're completing an item.
        this.storeItemId(playPlanMgr.activePlanItemId, stepNum);

      } else {
        // For instance, first step does not yet have an active plan item.
        // Steps that create project plan items also do not.
        let topItem = findTopItem(step, fs);
        if (! topItem) {
          console.log('Not sure where to put this step: ', step);
          this.problems.push('Not sure where to put this step: ' + stepNum);
        } else {
          this.storeItemId(topItem.id, stepNum);
        }

      }
    });
  }

}
