import { Component, Input, OnInit } from '@angular/core';

// 2017-04-30: Dead code right now, replaced by: app-author-summary-project-table which also shows skills for each step.

@Component({
  selector: 'app-author-summary-plan-tree',
  template: `
<ul *ngIf="todo">
  <li *ngFor="let child of todo">
    <div tabindex="1">
      <i class="fa fa-fw fa-check" *ngIf="child.done === 'T'"></i>
      <i class="fa fa-fw fa-square-o quiet-disabled" *ngIf="child.done !== 'T'"></i>
      {{child.title}}
      &nbsp;&nbsp;
      <span *ngFor="let step of getSteps(child)">
        &nbsp;<a routerLink="/author/{{project.id}}/step/{{step}}">{{step}}</a>
      </span>
    </div>
    <div *ngIf="child.children">
        <app-author-summary-plan-tree [todo]="child.children" [root]="getRoot()" [todoToStep]="todoToStep" [project]="project"></app-author-summary-plan-tree>
    </div>
  </li>
</ul>
<div *ngIf="!todo"><em>Empty</em></div>
  `,
  styles: ['ul li { list-style: none; }',
    'ul { padding: 0 0 0 1em }',
    'div { padding: 5px }',
    'i.quiet-disabled { color: LightGrey }'
  ]
})
export class AuthorSummaryPlanTreeComponent implements OnInit {

  @Input() todo: any;
  @Input() root: any;
  @Input() todoToStep: any;
  @Input() project: any;

  constructor() { }

  ngOnInit() {
  }

  //noinspection JSUnusedGlobalSymbols
  getRoot() {
    return this.root ? this.root : this.todo;
  }

  //noinspection JSUnusedGlobalSymbols,JSMethodCanBeStatic
  getSteps(child): Array<number> {
    let entries = this.todoToStep[child.id];
    if (entries) {
      return entries;
    } else {
      return [];
    }
  }

}
