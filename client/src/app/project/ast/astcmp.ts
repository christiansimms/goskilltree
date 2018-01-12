import {intrinsicTypes, isEmptyOrFalse, LangAdapter, complain} from "./utils";
import {isArray} from "../../common/type-helper";


export class Location {
  constructor(public from, public to) {
  }
}

export interface IWrongChange {
  getFeedbackStr(): string;
  getLocation(): Location;
}

export class SimpleProblem implements IWrongChange {
  constructor(public message) {
  }

  getFeedbackStr(): string {
    return this.message;
  }

  getLocation(): Location {
    return null;
  }
}

class WrongChange implements IWrongChange {
  public foundNodeStack: any;
  private feedbackStr: string;
  private location: Location;

  constructor(public expectNode, public foundNode, public fieldName, public langAdapter: LangAdapter) {
    this.foundNodeStack = [];
  }

  updateStack(nameOrIndex, node): WrongChange {
    this.foundNodeStack.push([nameOrIndex, node]);
    return this;
  }

  // Due to design of calling updateStack() after creation to fill in stack, we need this finalize()
  // to finish construction.
  finalize(): void {
    if (this.langAdapter.getLang() === 'js') {
      let [loc, str] = summarizeWrongChangeJs(this);
      this.feedbackStr = str;
      this.location = new Location(
        /*from=*/ {line: loc.start.line - 1, ch: loc.start.column},
        /*to=*/ {line: loc.end.line - 1, ch: loc.end.column},
      );
    } else if (this.langAdapter.getLang() === 'html') {
      let [location, str] = summarizeWrongChangeHtml(this);
      this.feedbackStr = str;
      this.location = location;
    } else {
      throw new Error('Bad language: ' + this.langAdapter.getLang());
    }
  }

  getFeedbackStr(): string {
    return this.feedbackStr;
  }

  getLocation(): Location {
    return this.location;
  }
}

function findLocInfoJs(foundNodeStack: any) {
  for (let stuff of foundNodeStack) {
    let [, node] = stuff;
    if (node.loc) {
      return stuff;
    }
  }
  throw new Error('Did not find any loc info');
}

function summarizeWrongChangeJs(astDiff: WrongChange): [any, string] {

  // Find first node in stack with loc info.
  let nameAndNodeWithLoc = findLocInfoJs([].concat([['', astDiff.foundNode]], astDiff.foundNodeStack));
  let [, nodeWithLoc] = nameAndNodeWithLoc;

  // Compute location.
  let loc = nodeWithLoc.loc;
  let start = loc.start;

  // Compute text.
  if (astDiff.fieldName === 'wrong-array-length') {
    let fieldNameForArray = astDiff.foundNodeStack[0][0];
    return [loc, 'On line ' + start.line + ', I expected ' + astDiff.expectNode.length + ' ' + fieldNameForArray +
    ' but found ' + astDiff.foundNode.length + ' ' + fieldNameForArray];
  } else if (astDiff.fieldName === 'simple-value-diff') {
    return [loc, 'On line ' + start.line + ', I expected "' + astDiff.expectNode + '" but found "' + astDiff.foundNode + '".'];
  } else if (astDiff.fieldName === 'type') {
    let expectValue = astDiff.expectNode['type'];
    let foundValue = astDiff.foundNode['type'];
    return [loc, 'On line ' + start.line + ', I expected "' + expectValue + '" but found "' + foundValue + '".'];
  } else {
    complain('TODO-unknown astDiff: ' + astDiff.fieldName);
  }
}

function findLocInfoHtml(foundNodeStack: any) {
  for (let stuff of foundNodeStack) {
    let [, node] = stuff;
    if (node && node.__location) {  // node might be undefined if an attribute is completely missing
      return stuff;
    }
  }
  throw new Error('Did not find any __location info');
}

export function findLocInfoRightSideContext(context: any) {
  while (context) {
    // If a node is deleted then the first context.right is undefined, so add condition below.
    if (context.right && context.right.__location) {
      return context.right.__location;
    }
    context = context.parent;
  }
}

// EXP: summarizeWrongChangeHtml is basic clone of Js version, only diffs: .loc vs. .__location
function summarizeWrongChangeHtml(astDiff: WrongChange): [any, string] {

  // Find first node in stack with __location info.
  let nameAndNodeWithLoc = findLocInfoHtml([].concat([['', astDiff.foundNode]], astDiff.foundNodeStack));
  let [, nodeWithLoc] = nameAndNodeWithLoc;

  // Compute location. TODO: probably cannot handle multi-line well.
  let loc = nodeWithLoc.__location;
  let startLine = loc.line - 1;
  let totalLen = loc.endOffset - loc.startOffset;
  let location = new Location(
    /*from=*/ {line: startLine, ch: loc.col - 1},
    /*to=*/ {line: startLine, ch: loc.col - 1 + totalLen},
  );

  // Compute text.
  if (astDiff.fieldName === 'wrong-array-length') {
    let fieldNameForArray = astDiff.foundNodeStack[0][0];
    return [location, 'On line ' + startLine + ', I expected ' + astDiff.expectNode.length + ' ' + fieldNameForArray +
    ' but found ' + astDiff.foundNode.length + ' ' + fieldNameForArray];
  } else if (astDiff.fieldName === 'simple-value-diff') {
    return [location, 'On line ' + startLine + ', I expected "' + astDiff.expectNode + '" but found "' + astDiff.foundNode + '".'];
  } else if (astDiff.fieldName === 'type') {
    let expectValue = astDiff.expectNode['type'];
    let foundValue = astDiff.foundNode['type'];
    return [location, 'On line ' + startLine + ', I expected "' + expectValue + '" but found "' + foundValue + '".'];
  } else {
    complain('TODO-unknown astDiff: ' + astDiff.fieldName);
  }
}


function findFirstDiffRec(langAdapter: LangAdapter, oldAst, newAst): WrongChange {
  if (isEmptyOrFalse(oldAst) && isEmptyOrFalse(newAst)) {
    // Both empty, good.
    return null;
  }

  if (isArray(oldAst)) {
    if (oldAst.length !== newAst.length) {
      return new WrongChange(oldAst, newAst, 'wrong-array-length', langAdapter);
    }
    for (let i = 0, l = oldAst.length; i < l; ++i) {
      let result = findFirstDiffRec(langAdapter, oldAst[i], newAst[i]);
      if (result) {
        return result.updateStack(i, newAst[i]);  // Important to updateStack on way up + out.
      }
    }
  } else if (intrinsicTypes.indexOf(oldAst.constructor) >= 0) {
    // Simple type.
    if (oldAst !== newAst) {
      return new WrongChange(oldAst, newAst, 'simple-value-diff', langAdapter);
    }
  } else {
    // Check type first. If types differ, we don't want to compare other fields, since they'll be so different.
    if (oldAst.type !== newAst.type) {
      return new WrongChange(oldAst, newAst, 'type', langAdapter);
    }
    let names = langAdapter.getFieldNamesOnAstNode(oldAst);
    for (let index = 0, nameCount = names.length; index < nameCount; ++index) {
      let name = names[index];
      if (name === 'type') {
        // Skip this, we already checked it.
      } else {
        let oldVal = oldAst[name];
        let newVal = newAst[name];
        let result = findFirstDiffRec(langAdapter, oldVal, newVal);
        if (result) {
          return result.updateStack(name, newVal);  // Important to updateStack on way up + out.
        }
      }
    }
  }

  // No problem.
  return null;
}

// Return first difference between 2 (small) ASTs.
// Don't use jsondiffpatch, that's way too complex, and also at the line-level, but we want at the symbol level.
export function findFirstDiff(langAdapter: LangAdapter, oldAst, newAst): IWrongChange {
  let wrongChange: WrongChange = findFirstDiffRec(langAdapter, oldAst, newAst);
  if (wrongChange) {
    wrongChange.updateStack(null, newAst);  // Add top level element. Added for text value diff in html, hope no side effects for js.
    wrongChange.finalize();
  }
  return wrongChange;
}


function visitAstRec(langAdapter: LangAdapter, ast, fn): void {
  if (isEmptyOrFalse(ast)) {
    // Empty value.
  } else if (isArray(ast)) {
    // Array.
    for (let i = 0, l = ast.length; i < l; ++i) {
      visitAstRec(langAdapter, ast[i], fn);
    }
  } else if (intrinsicTypes.indexOf(ast.constructor) >= 0) {
    // Simple type.
  } else {
    // At an object: visit it, and go through fields.
    fn(ast);
    let names = langAdapter.getFieldNamesOnAstNode(ast);
    for (let index = 0, nameCount = names.length; index < nameCount; ++index) {
      let name = names[index];
      let oldVal = ast[name];
      visitAstRec(langAdapter, oldVal, fn);
    }
  }
}

// Visit AST.
// Don't use recast.visit, since that has side effect of adding null values sometimes.
export function visitAst(langAdapter: LangAdapter, ast, fn): void {
  visitAstRec(langAdapter, ast, fn);
}
