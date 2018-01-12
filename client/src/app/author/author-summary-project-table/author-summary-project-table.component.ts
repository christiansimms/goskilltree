import {Component, Input, OnInit} from '@angular/core';
import {visitProjectPlanRecWithLevel} from "../../project/project-plan";

// Display project plan in a table, with steps and skills.
@Component({
  selector: 'app-author-summary-project-table',
  template: `
<table class="table">
  <thead>
  <tr>
    <th>Plan Tasks</th>
    <th>Steps</th>
    <th>Skills</th>
  </tr>
  </thead>
  <tbody>
  <tr *ngFor="let task of projectPlanTasks">
    <td>

      <div tabindex="1" [ngClass]="'indent-' + task.level">
        <i class="fa fa-fw fa-check" *ngIf="task.done === 'T'"></i>
        <i class="fa fa-fw fa-square-o quiet-disabled" *ngIf="task.done !== 'T'"></i>
        {{task.title}}
        &nbsp;&nbsp;
        <span class="task-number-id">#{{task.id}}</span>
      </div>
      
    </td>
    <td>

      <span *ngFor="let step of getSteps(task)">
        &nbsp;<a routerLink="/author/{{project.id}}/step/{{step}}">{{step}}</a>
      </span>

    </td>
    <td>

      <div *ngFor="let skill of task.skills">
        {{skill}}
      </div>

    </td>
  </tr>
  </tbody>
</table>
 
  `,
  styles: [
    '.task-number-id { font-size: 75%; color: LightGrey; }',
    'i.quiet-disabled { color: LightGrey }',
    '.indent-1 {margin-left: 2em}',
    '.indent-2 {margin-left: 4em}',
    '.indent-3 {margin-left: 6em}',
    '.indent-4 {margin-left: 8em}',
    '.indent-5 {margin-left: 10em}',
    '.indent-6 {margin-left: 12em}',
    '.indent-7 {margin-left: 14em}',
    '.indent-8 {margin-left: 16em}',
    '.indent-9 {margin-left: 18em}',
  ]
})
export class AuthorSummaryProjectTableComponent implements OnInit {

  @Input() todo: any;
  @Input() todoToStep: any;
  @Input() project: any;
  projectPlanTasks: any;

  constructor() {
  }

  ngOnInit() {
    if (this.project) {
      this.computeFlatProject();
    }
  }

  private computeFlatProject() {
    this.projectPlanTasks = [];
    let me = this;
    function collect(item, level) {
      me.projectPlanTasks.push({id: item.id, title: item.title, done: item.done, skills: item.skills, level: level});
    }
    visitProjectPlanRecWithLevel(this.todo, collect);
  }

  getSteps(child): Array<number> {
    let entries = this.todoToStep[child.id];
    if (entries) {
      return entries;
    } else {
      return [];
    }
  }
}
