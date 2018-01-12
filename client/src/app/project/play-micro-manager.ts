/* 2017-10-24: disable this code, too many bugs right now. */

import {FileSystemContainer, filterDeltaNoProjectPlan, getLangAdapterFromFilename} from "./ast/utils";
import {IAuthorStep} from "../author/author.service";
import {ScoperJs} from "./ast/ecmascript";
import {findStatementDescInScope} from "./ast/astdiff";


function getExpectedStartColumn(addAfterItem: any) {
  if (addAfterItem.type === 'BlockStatement') {
    return addAfterItem.loc.start.column + 1;
  } else if (addAfterItem.type === 'ExpressionStatement') {
    return addAfterItem.loc.end.column;
  } else {
    return addAfterItem.loc.start.column;
  }
}

enum AddState {
  LookingForSpot,
  AtRightSpot,
  AlreadyHitEnter
}

class AddManager {
  private state: AddState = AddState.LookingForSpot;

  constructor(private addAfterItem) {
  }

  handleCursorActivity(cursorActivity) {
    switch (this.state) {
      case AddState.LookingForSpot:
      case AddState.AtRightSpot:
        let expectedLine = this.addAfterItem.loc.start.line;
        let currentLine = cursorActivity.line + 1;  // CodeMirror starts lines at 0, but recast at 1.
        if (expectedLine === currentLine) {
          let expectedCol = getExpectedStartColumn(this.addAfterItem);  // this.addAfterItem.loc.start.column;
          let currentCol = cursorActivity.ch;
          if (expectedCol === currentCol) {
            this.state = AddState.AtRightSpot;
            return 'Exact right spot';
          } else {
            this.state = AddState.LookingForSpot;
            return 'Right line, wrong column';
          }
        } else {
          this.state = AddState.LookingForSpot;
          return 'Wrong line!';
        }
      case AddState.AlreadyHitEnter:
        return "";
    }
  }

  handleBeforeChange(beforeChange) {
    switch (this.state) {
      case AddState.LookingForSpot:
        // No change is allowed here.
        beforeChange.cancel();
        return "You're not in the right spot to make a change yet!";
      case AddState.AtRightSpot:
        if (beforeChange.text.length === 2) {
          // This means there's a carriage return.
          this.state = AddState.AlreadyHitEnter;
          return "Good";
        } else {
          beforeChange.cancel();
          return "You need to hit Enter.";
        }
      case AddState.AlreadyHitEnter:
        if (beforeChange.text.length === 1) {
          return "";
        } else {
          beforeChange.cancel();
          return "You cannot add another line.";
        }
    }
  }
}


enum ReplaceState {
  LookingForLine,
  OnRightLine
}

class ReplaceManager {
  private state: ReplaceState = ReplaceState.LookingForLine;

  constructor(private gotoItem) {
  }

  handleCursorActivity(cursorActivity) {
    switch (this.state) {
      case ReplaceState.LookingForLine:
      case ReplaceState.OnRightLine:
        let expectedLine = this.gotoItem.loc.start.line;
        let currentLine = cursorActivity.line + 1;  // CodeMirror starts lines at 0, but recast at 1.
        if (expectedLine === currentLine) {
          this.state = ReplaceState.OnRightLine;
          return 'On the right line';
        } else {
          this.state = ReplaceState.LookingForLine;
          return 'Wrong line!';
        }
    }
  }

  handleBeforeChange(beforeChange) {
    switch (this.state) {
      case ReplaceState.LookingForLine:
        // No change is allowed here.
        beforeChange.cancel();
        return "You're not in the right spot to make a change yet!";
      case ReplaceState.OnRightLine:
        if (beforeChange.text.length === 2) {
          // This means there's a carriage return.
          beforeChange.cancel();
          return "You cannot hit Enter.";
        } else {
          return "";
        }
    }
  }
}


export class PlayMicroManager {
  expectMgr;  // This won't be defined on mess-around mode.

  // Important: need to use "fs", and not "prevfs", because "prevfs" formatting is automatic, and so
  // its spacing is possibly different from fs. And spacing is important here.
  constructor(private driverStep: IAuthorStep, private fs: FileSystemContainer) {
    this.figureOutChange();
  }

  handleCursorActivity(cursorActivity) {
    return this.expectMgr ? this.expectMgr.handleCursorActivity(cursorActivity) : "";
  }

  // Only allow valid changes.
  handleBeforeChange(beforeChange) {
    return this.expectMgr ? this.expectMgr.handleBeforeChange(beforeChange) : "";
  }

  private figureOutChange() { // TODO: handle multiple changes in one diff
    for (let deltaEntry of filterDeltaNoProjectPlan(this.driverStep.delta)) {
      let ast = this.fs.getAst(deltaEntry.filename);
      const langAdapter = getLangAdapterFromFilename(deltaEntry.filename);
      for (let jsonPatch of deltaEntry.diffs) {

        if (langAdapter.getLang() === 'js') {
          // Keep in sync: PlayMicroManager.figureOutChange and astdiff-apply's applyJsonPatchesFunJs.
          let scoper = new ScoperJs(jsonPatch);
          let sloppyScope = scoper.findScope(ast);
          if (jsonPatch.op === 'add') {
            let position = scoper.getArrayPosition();
            if (position) {
              // These work on arrays.
              let addAfterItem;
              if (position === '#last') {
                let scope = scoper.findDefaultBodyOfAstJs(sloppyScope, /*needLocInfo=*/false);
                addAfterItem = scope[scope.length - 1];
              } else if (position === '#first') {
                //noinspection UnnecessaryLocalVariableJS
                let scope = scoper.findDefaultBodyOfAstJs(sloppyScope, /*needLocInfo=*/true);
                addAfterItem = scope;
              } else if (position.startsWith('#after')) {
                let desc = position.substring('#after'.length).trim();
                let scope = scoper.findDefaultBodyOfAstJs(sloppyScope, /*needLocInfo=*/false);
                let index = findStatementDescInScope(langAdapter, scope, desc);
                addAfterItem = scope[index];
              } else {
                throw new Error('NYI applyJsonPatchesFun: position: ' + position);
              }
              this.expectMgr = new AddManager(addAfterItem);
            } else {
              throw new Error('NYI no position');
            }

          } else if (jsonPatch.op === 'add_file') {
            throw new Error('Not handled op: ' + jsonPatch.op);

          } else if (jsonPatch.op === 'replace' || jsonPatch.op === 'delete') {  // Be lazy for now and use replace.
            let parentScope = scoper.findRealAstNodeForReplaceDelete(sloppyScope);
            let pos = scoper.findDeletePosition(parentScope);
            let realNode = parentScope[pos];

            this.expectMgr = new ReplaceManager(realNode);

          } else {
            throw new Error('Bad op: ' + jsonPatch.op);
          }
        } else {
          throw new Error('Language not yet handled');
        }
      }
    }
  }
}
