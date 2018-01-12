import {IAuthorStep, IDeltaEntry} from "../author/author.service";
import {assert, FileSystemContainer, smartSplit, StepAdapter} from "./ast/utils";
import {findNodeWithId, parseJsonIdString} from "./ast/json/json.scope";
import {isNumber} from "../common/type-helper";

export function visitProjectPlanRec(root, fn) {
  for (let child of root) {
    fn(child);
    if (child.children) {
      visitProjectPlanRec(child.children, fn);
    }
  }
}

// Like visitProjectPlanRec but pass in level also.
export function visitProjectPlanRecWithLevel(root, fn, level?: number) {
  if (!level) {
    level = 0;
  }
  for (let child of root) {
    fn(child, level);
    if (child.children) {
      visitProjectPlanRecWithLevel(child.children, fn, level + 1);
    }
  }
}


// Return skills that are done.
export function collectCompleteSkills(projectPlan, skillIndex) {
  function collectSkills(item) {
    if (item.skills && item.done === 'T') {
      item.skills.forEach(skill => {
        skillIndex[skill] = !skillIndex[skill] ? 1 : (skillIndex[skill] + 1);
      });
    }
  }

  visitProjectPlanRec(projectPlan, collectSkills);
}


function getIdListRec(root, out) {
  for (let child of root) {
    out.push(child.id);

    // Recurse.
    if (child.children) {
      getIdListRec(child.children, out);
    }
  }
}

function getIdList(root) {
  let out = [];
  getIdListRec(root, out);
  return out;
}

function allocateNewId(root) {
  // let index = buildIndexById(root);
  let ids = getIdList(root);
  let biggest = Math.max(...ids);
  if (biggest) {
    return biggest + 1;
  } else {
    // None found, start at 1.
    return 1;
  }
}

export function createTodoItem(root: any, value: string) {
  let id = allocateNewId(root);
  return {id: id, title: value};
}

export function deleteEmptyChildren(root: any) {
  function deleteEmptyChildrenHelper(item) {
    if (item.children && item.children.length === 0) {
      delete item.children;
    }
  }

  visitProjectPlanRec(root, deleteEmptyChildrenHelper);
}

function findActiveTodo(plandb) {
  let out = [];

  function collectTerminalIncompletes(item) {
    if (item.children && item.children.length > 0) {
      // Non-terminal.
    } else {
      // Terminal.
      if (item.done === 'T') {
        // Done.
      } else {
        // Not done.
        out.push(item);
      }
    }
  }

  visitProjectPlanRec(plandb, collectTerminalIncompletes);
  return out[0];
}


export class AuthorPlanMgr {
  summary: string;
  donePlanItem: any;
  incompletePlanItem: any;

  // Watch out, playPlanMgr has the previous version of the plandb.
  constructor(public plandb: any, private playPlanMgr: PlayPlanMgr) {
    this.figureOutState();
  }

  figureOutState() {
    let activePlanId = this.playPlanMgr.getActivePlanItemId();
    if (activePlanId) {
      let activeTodo = findNodeWithId(this.plandb, activePlanId);
      if (activeTodo.done === 'T') {
        this.donePlanItem = activeTodo;
        this.summary = 'Item done on this step: ' + activePlanId;
      } else {
        this.incompletePlanItem = activeTodo;
        this.summary = 'Project Plan: found active todo: ' + activeTodo.title;
      }
    } else {
      this.summary = 'No active item yet.';
    }
  }

  //noinspection JSUnusedGlobalSymbols
  getActivePlanItem(): any {
    if (this.donePlanItem) {
      return this.donePlanItem;
    } else if (this.incompletePlanItem) {
      return this.incompletePlanItem;
    } else {
      // Nothing yet.
      return null;
    }
  }

  summarizeStep(): string {
    return this.summary;
  }

  markDone() {
    this.incompletePlanItem.done = 'T';
  }
}


// PlayPlanMgr is like AuthorPlanMgr, but much simpler.
export class PlayPlanMgr {
  isProjectUpdateStep: boolean;
  activePlanItemId: any;

  // Take prevfs as parameter, since we want to find the first incomplete item, even if it's been completed in this step.
  constructor(private driverStep: IAuthorStep, private prevfs: FileSystemContainer) {
    this.figureOutState();
  }

  figureOutState() {
    // Find if project update step.
    this.isProjectUpdateStep = StepAdapter.isOnlyProjectPlanUpdateStep(this.driverStep);

    // Find active plan id.
    let plandb = this.prevfs.maybeFindFile('db/todo.json');
    let activeTodo = plandb ? findActiveTodo(plandb) : null;  // First step does not have a plandb.
    if (activeTodo) {
      this.activePlanItemId = activeTodo.id;
    } else {
      this.activePlanItemId = 0;
    }
  }

  //noinspection JSUnusedGlobalSymbols
  getActivePlanItemId(): number {
    return this.activePlanItemId;
  }
}


// Either return item, or if it's a list then return smallest one.
function findSmallestItem(item) {
  if (item.id) {
    return item;
  } else {
    // Assume it's a list -- return smallest one.
    let smallestId = Math.min.apply(Math, item.map(function (o) {
      return o.id;
    }));
    assert(isNumber(smallestId), 'Internal error finding id');
    return item.find(function (o) {
      return o.id === smallestId;
    });
  }
}


// Return top item being added in this project plan update step.
export function findTopItem(step: IAuthorStep, fs: FileSystemContainer): any {
  let deltaEntry: IDeltaEntry = StepAdapter.findProjectPlanDeltaEntry(step);
  if (!deltaEntry) {
    return null;
  }

  //noinspection LoopStatementThatDoesntLoopJS
  for (let jsonPatch of deltaEntry.diffs) {

    if (jsonPatch.op === 'add') {
      //noinspection UnnecessaryLocalVariableJS
      let maybeItem = jsonPatch.prettyValue;
      if (jsonPatch.path.endsWith('/done')) {
        // 2017-11-26: Allow a step which is only marking intermediate as done.
        let scopeList = smartSplit(jsonPatch.path, '/');
        scopeList.pop();  // Remove /done
        let itemDesc = scopeList.pop();
        let id = parseJsonIdString(itemDesc);
        let plandb = fs.maybeFindFile('db/todo.json');
        return findNodeWithId(<any>plandb, id);
      } else {
        return findSmallestItem(maybeItem);
      }

    } else if (jsonPatch.op === 'add_file') {
      let items = jsonPatch.prettyValue;
      return (<any>items[0]);

    } else if (jsonPatch.op === 'replace' || jsonPatch.op === 'delete') {
      throw new Error('Not handled op: ' + jsonPatch.op);

    } else {
      throw new Error('Bad op: ' + jsonPatch.op);
    }
  }

  throw new Error('Did not find a top item.');
}

