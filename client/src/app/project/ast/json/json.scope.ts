// Helper for applying patches.
import {complain, assert} from "../utils";


export function parseJsonIdString(value: string): number {
  let [str, id] = value.split('=');
  assert(str === 'id', 'Bad json id string: ' + value);
  return +id;
}

function findNodeAndParentWithIdRec(currentScope: any[], goalId: number) {
  for (let item of currentScope) {
    if (item.id === goalId) {
      return [currentScope, item];
    }

    // Recurse.
    if (item.children) {
      let result = findNodeAndParentWithIdRec(item.children, goalId);
      if (result) {
        return result;
      }
    }
  }
}

function findNodeAndParentWithId(currentScope: any[], goalId: number) {
  let result = findNodeAndParentWithIdRec(currentScope, goalId);
  if (result) {
    return result;
  } else {
    // Did not find it.
    complain('findNodeWithId did not find: ' + goalId);
  }
}

export function findNodeWithId(currentScope: any[], goalId: number) {
  return findNodeAndParentWithId(currentScope, goalId)[1];
}

export class ScoperJson {
  mode: string;
  nodeWithAttributes: any;
  itemToAdd: string;
  attribName: string;
  itemToDelete: string;

  constructor(public op: string) {
    this.mode = 'top';
  }

  isInAttribs() {
    return this.mode === 'attribs';
  }

  isInEntity() {
    return this.mode === 'entity';
  }

  findScope(ast: any, scopeList: string[]) {

    if (this.op === 'add') {
      // Yank out special positional stuff at end.
      this.itemToAdd = scopeList.pop();
    } else if (this.op === 'replace' || this.op === 'delete') {
      // Yank out special positional item at end.
      this.itemToDelete = scopeList.pop();
    } else if (this.op === 'add_file') {
      // Nothing to do.
    } else {
      throw new Error('Bad op: ' + this.op);
    }

    // Go through scopes.
    let currentScope = ast;
    while (scopeList.length > 0) {
      let desiredScopeDesc = scopeList.shift();  // get first one in list
      currentScope = this.findOneScopeJson(currentScope, desiredScopeDesc);
    }

    return currentScope;
  }

  findOneScopeJson(currentScope: any, desiredScopeDesc: string) {
    if (this.mode === 'top') {
      if (desiredScopeDesc.startsWith('id=')) {
        this.mode = 'entity';
        let id = parseJsonIdString(desiredScopeDesc);
        return findNodeWithId(currentScope, id);
      } else {
        complain('findOneScopeJson NYI: ' + desiredScopeDesc);
      }

    } else if (this.mode === 'entity') {
      this.attribName = desiredScopeDesc;
      return currentScope[this.attribName];

    } else {
      throw new Error('Bad mode: ' + this.mode);
    }
  }

  // Since this requires so much state from here, let's try doing the whole operation here.
  performDelete(scope) {
    if (this.isInAttribs()) {
      // Delete attribute.
      delete this.nodeWithAttributes[this.itemToDelete];
    } else {
      // Find then delete node.
      let id = parseJsonIdString(this.itemToDelete);
      let [parent, node] = findNodeAndParentWithId(scope, id);
      let index = parent.indexOf(node);
      parent.splice(index, 1);
    }

  }
}
