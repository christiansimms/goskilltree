import {smartSplit, LangAdapter, complain, assert} from "./utils";
import {IJsonPatch, getAstOnPatch, findStatementDescInScope} from "./astdiff";
import {isArray} from "../../common/type-helper";
import {ScoperHtml} from "./html/html.context";
import {ScoperJs} from "./ecmascript";
import {ScoperJson} from "./json/json.scope";


// Apply given jsonPatches to the given ast.
// Keep in sync: PlayMicroManager.figureOutChange and astdiff-apply's applyJsonPatchesFunJs.
export function applyJsonPatchesFunJs(langAdapter: LangAdapter, ast, jsonPatches: Array<IJsonPatch>): void {
  for (let jsonPatch of jsonPatches) {
    let scoper = new ScoperJs(jsonPatch);
    let scope = scoper.findScope(ast);

    if (jsonPatch.op === 'add') {
      // Add one AST tree (not necessarily one line).
      let position = scoper.getArrayPosition();
      let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
      if (position) {
        // These work on arrays.
        scope = scoper.findDefaultBodyOfAstJs(scope);
        if (position === '#last') {
          scope.push(newAst);
        } else if (position === '#first') {
          scope.splice(0, 0, newAst);
        } else if (position.startsWith('#after')) {
          let desc = position.substring('#after'.length).trim();
          let index = findStatementDescInScope(langAdapter, scope, desc);
          scope.splice(index + 1, 0, newAst);  // + 1 for after the given statement
        } else if (isArray(scope)) {
          throw new Error('NYI applyJsonPatchesFun: position: ' + position);
        }

      } else if (jsonPatch.path.endsWith('/comments')) {
        // Add comment. newAst is an array.
        // scope.splice(0, 0, newAst);
        scope.push(...newAst);  // Use the new spread operator.

      } else {
        // Assume it's html adding an attribute, which is on an object, not an array.
        throw new Error('TODO');
      }
    } else if (jsonPatch.op === 'replace') {
      let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
      scoper.performReplace(scope, newAst);
    } else if (jsonPatch.op === 'delete') {
      scoper.performDelete(scope);
    } else {
      throw new Error('NYI applyJsonPatchesFun: op: ' + jsonPatch.op);
    }
  }
}

// Apply given jsonPatches to the given ast.
export function applyJsonPatchesFunHtml(langAdapter: LangAdapter, ast, jsonPatches: Array<IJsonPatch>): void {
  for (let jsonPatch of jsonPatches) {
    let scopeList = smartSplit(jsonPatch.path, '/');
    let scoper = new ScoperHtml(jsonPatch.op);
    let scope = scoper.findScope(ast, scopeList);

    if (jsonPatch.op === 'add') {
      // Add one AST tree (not necessarily one line).
      let position = scoper.getArrayPosition();
      if (position) {
        // These work on arrays - the children array for DOM nodes.
        scope = scope.children;
        let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
        if (position === '#last') {
          scope.push(newAst);
        } else if (position === '#first') {
          scope.splice(0, 0, newAst);
        } else if (position.startsWith('#after')) {
          let desc = position.substring('#after'.length).trim();
          let index = findStatementDescInScope(langAdapter, scope, desc);
          scope.splice(index + 1, 0, newAst);  // + 1 for after the given statement
        } else {
          throw new Error('Bad position: ' + position);
        }
      } else {
        // Assume it's html adding an attribute, which is on an object, not an array.
        scoper.nodeWithAttributes.attribs[scoper.attribName] = jsonPatch.prettyValue;
      }
    } else if (jsonPatch.op === 'replace') {
      if (scoper.isInAttribs()) {
        // Replacing an attribute.
        scoper.nodeWithAttributes.attribs[scoper.itemToDelete] = jsonPatch.prettyValue;
      } else {
        // These work on arrays - the children array for DOM nodes.
        scope = scope.children;
        let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
        scope.splice(scoper.findDeletePosition(scope), 1, newAst);
      }
    } else if (jsonPatch.op === 'delete') {
      if (scoper.isInAttribs()) {
        // Delete attribute.
        delete scoper.nodeWithAttributes.attribs[scoper.itemToDelete];
      } else {
        // Delete node.
        // These work on arrays - the children array for DOM nodes.
        scope = scope.children;
        scope.splice(scoper.findDeletePosition(scope), 1);
      }
    } else {
      throw new Error('NYI applyJsonPatchesFun: op: ' + jsonPatch.op);
    }
  }
}

// Apply given jsonPatches to the given ast.
export function applyJsonPatchesFunJson(langAdapter: LangAdapter, ast, jsonPatches: Array<IJsonPatch>): void {
  for (let jsonPatch of jsonPatches) {
    let scopeList = smartSplit(jsonPatch.path, '/');
    let scoper = new ScoperJson(jsonPatch.op);
    let scope = scoper.findScope(ast, scopeList);

    if (jsonPatch.op === 'add') {
      // Add one AST tree (not necessarily one line).
      let itemToAdd = scoper.itemToAdd;
      let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
      if (itemToAdd.startsWith('#')) {
        // These work on arrays.
        if (itemToAdd === '#last') {
          scope.push(newAst);
        } else if (itemToAdd === '#first') {
          scope.splice(0, 0, newAst);
        } else if (itemToAdd.startsWith('#after')) {
          let desc = itemToAdd.substring('#after'.length).trim();
          let index = findStatementDescInScope(langAdapter, scope, desc);
          scope.splice(index + 1, 0, newAst);  // + 1 for after the given statement
        } else {
          throw new Error('Bad position: ' + itemToAdd);
        }
      } else {
        // Assume it's adding an attribute like .title or .children, which is on an object, not an array.
        scope[scoper.itemToAdd] = newAst;
      }

    } else if (jsonPatch.op === 'replace') {
      let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
      if (scoper.isInEntity()) {
        // Must be attribute.
        assert(scoper.itemToDelete, 'No attribute to replace');
        //noinspection UnnecessaryLocalVariableJS
        let entity = scope;
        entity[scoper.itemToDelete] = newAst;
      } else if (scoper.isInAttribs()) {
        // Replacing an attribute.
        scoper.nodeWithAttributes[scoper.itemToDelete] = newAst;
      } else {
        complain('json replace on non attrib');
      }

    } else if (jsonPatch.op === 'delete') {
      scoper.performDelete(scope);

    } else if (jsonPatch.op === 'add_file') {
      // Assume array and copy it.
      // Yikes, below line is needed for its side effect of filling in jsonPatch.value from jsonPatch.prettyValue
      let newAst = langAdapter.copyAstStripLoc(getAstOnPatch(langAdapter, jsonPatch));
      // let newAst: any = jsonPatch.prettyValue;
      scope.push(...newAst);  // Use the new spread operator.

    } else {
      throw new Error('NYI applyJsonPatchesFunJson: op: ' + jsonPatch.op);
    }
  }
}
