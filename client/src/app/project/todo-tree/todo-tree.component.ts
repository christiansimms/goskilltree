import {Component, Input, OnInit} from '@angular/core';
import {complain} from "../ast/utils";
import {createTodoItem, deleteEmptyChildren} from "../project-plan";

@Component({
  selector: 'app-todo-tree',
  template: `
<ul *ngIf="todo">
  <li *ngFor="let child of todo">
    <div tabindex="1" (keydown)="onKey(todo, child, $event)" [ngClass]="{'bg-success': child.id === activePlanItemId}">
      <i class="fa fa-fw fa-check" *ngIf="child.done === 'T'"></i>
      <i class="fa fa-fw fa-square-o quiet-disabled" *ngIf="child.done !== 'T'"></i>
      {{child.title}}
    </div>
    <div *ngIf="child.children">
        <app-todo-tree [todo]="child.children" [root]="getRoot()" [treeChanges]="treeChanges" [activePlanItemId]="activePlanItemId"></app-todo-tree>
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
export class TodoTreeComponent implements OnInit {

  @Input() todo: any;
  @Input() root: any;
  @Input() treeChanges: any;
  //noinspection JSUnusedGlobalSymbols
  @Input() activePlanItemId: number;

  constructor() {
  }

  ngOnInit() {
  }

  getRoot() {
    return this.root ? this.root : this.todo;
  }

  // If a change is made, you must call this function so that the change is absorbed properly.
  _fireChangeEvent() {
    let fullAst = this.getRoot();
    this.treeChanges.emit(fullAst); // new FileSystemEditEvent(this.currentFileEntry, newAst));
  }

  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  onKey(itemParent, item, event) {

    if (event.key === '?') {
      // Show help.
      alert('e - Edit\no - Add item after\ni - Insert first child\nd - Delete\n> - Indent\nx - Toggle done');

    } else if (event.key === 'e') {
      let value = prompt('Edit item', item.title);
      if (value !== null) {
        item.title = value;
        this._fireChangeEvent();
      }

    } else if (event.key === 'o') {
      // Add child after.
      let value = prompt('Add item after', '');
      if (value !== null) {
        let index = itemParent.indexOf(item);
        if (index >= 0) {
          let newItem = createTodoItem(this.getRoot(), value);
          itemParent.splice(index + 1, 0, newItem);
          this._fireChangeEvent();
        } else {
          complain('Internal error, did not find child');
        }
      }

    } else if (event.key === 'i') {
      // Add child *under* as first child.
      let value = prompt('Add first child', '');
      if (value !== null) {
        let newItem = createTodoItem(this.getRoot(), value);
        if (!item.children) {
          item.children = [];
        }
        item.children.unshift(newItem);
        this._fireChangeEvent();
      }

    } else if (event.key === 'd') {
      let index = itemParent.indexOf(item);
      if (index >= 0) {
        if (confirm('Are you sure you want to delete: ' + item.title)) {
          itemParent.splice(index, 1);
          // If you add a first child, then delete it, get rid of empty children array.
          deleteEmptyChildren(this.getRoot());
          this._fireChangeEvent();
        }
      } else {
        complain('Internal error, did not find child');
      }

    } else if (event.key === '>') {
      // Indent: remove from parent and add to previous node.
      let index = itemParent.indexOf(item);
      if (index === 0) {
        alert('You cannot indent the first child');
      } else {
        // Remove from current position. In angular2, use splice, not delete!
        // delete itemParent[index];
        itemParent.splice(index, 1);

        // Add as child of previous node.
        let newParent = itemParent[index - 1];
        if (!newParent.children) {
          newParent.children = [];
        }
        newParent.children.push(item);
        this._fireChangeEvent();
      }

    } else if (event.key === 'x') {
      // Toggle done.
      if (item.done === 'T') {
        delete item.done;  // Out default is to not be present.
      } else {
        item.done = 'T';
      }
      this._fireChangeEvent();
    }

  }

}
