import {
  LangAdapter, smartSplit, complain, makeStackFromDiffContextRight, makeStackFromDiffContextLeft,
  assert
} from "../utils";
import {
  IJsonPatch, compareAstHtml, getAstOnPatch, filterHtmlProperty,
  deepVisit
} from "../astdiff";
import {parseAstHtml, prettyPrintAstHtml, parsePatchAstHtml} from "./html.ast";
import {
  computePartialAddContextForHtml,
  computePartialReplaceDeleteContextForHtml,
} from "./html.context";
import {findLocInfoRightSideContext} from "../astcmp";
import {deepCopy} from "../../../common/jsutils";


// Parse output of getUniqueStatementDesc. Pretty rough right now.
function describeUniqueStatementDesc(desc): string {
  if (desc.indexOf('#') >= 0) {
    // Format: tag#id.
    let [tag, id] = smartSplit(desc, '#');
    return 'tag ' + tag + ' with id=' + id;
  } else {
    return desc;
  }
}

export function getShortAstDescHtml(obj, contextName?: string): string {
  if (!obj.type) {
    if (contextName === 'params') {  // TODOfuture -- is this good enough?
      return contextName;
    } else {
      // console.log('getShortAstDescHtml skipping non ast node', contextName, '-', obj);
    }
  } else {
    return getAstDesc(obj, /*short=*/true);
  }
}


function getAstDesc(obj, short: boolean) {
  if (obj.type === "text") {
    return short ? 'string' : 'a string';
  } else if (obj.type === "tag") {
    let tagName = obj.name;
    let uniqueId = obj.attribs.id;
    if (uniqueId) {
      return short ? tagName + '#' + uniqueId : tagName + ' with id=' + uniqueId;
    } else {
      return tagName;
    }
  } else if (obj.type === "style" || obj.type === "script") {
    return obj.name;
  } else if (obj.type === "root") {
    // Nothing to say about root.
  } else {
    console.log('DEBUG.getAstDesc', obj);
    complain('Do not know how to describe AST node: ' + obj.type);
  }
}


function describeAstLocationForAdd(path) {
  let scopeList = smartSplit(path, '/');
  if (scopeList.length === 0) {
    // I'll leave this here, but it doesn't happen anymore.
    return 'the top of the file';
  } else {
    let out = [];

    // Yank out special positional item at end.
    let positionCode = scopeList.pop();
    let goesAtEnd: string = null;
    if (positionCode === '#first') {
      out.push('the beginning of ');
    } else if (positionCode === '#last') {
      out.push('the end of ');
    } else if (positionCode.startsWith('#after')) {
      let uniqueStatementDesc = positionCode.substring('#after'.length).trim();
      if (scopeList.length === 0) {
        // Good old special cases.
        return 'after ' + describeUniqueStatementDesc(uniqueStatementDesc);
      } else {
        goesAtEnd = ', after ' + describeUniqueStatementDesc(uniqueStatementDesc);
      }
    } else {
      throw new Error('describeAstLocationForAdd found bad positionCode: ' + positionCode);
    }

    if (scopeList.length > 0) {
      scopeList.forEach(scope => {
        out.push(describeUniqueStatementDesc(scope));
      });
    } else {
      out.push('the file');
    }
    if (goesAtEnd) {
      out.push(goesAtEnd);
    }
    return out.join('');  // ' of '
  }
}

function describeAstLocationForReplaceDelete(path) {
  let scopeList = smartSplit(path, '/');
  let out = [];

  scopeList.forEach(scope => {
    out.push(describeUniqueStatementDesc(scope));
  });
  out.reverse();
  return out.join(' in ');
}

// Return human description of given obj.
function getHumanAstDesc(obj): string {
  return getAstDesc(obj, /*short=*/false);
}


// Strip .__location attributes, to avoid confusing recast when it's reprinting.
function stripLocHtml(ast) {
  deepVisit(ast, item => delete item.__location);
  return ast;
}


export function pathHasHtmlAttribs(path: string) {
  return path.includes('/attribs/');
}

export function attribNameFromPath(path: string): string {
  let scopeList = smartSplit(path, '/');
  let attribName = scopeList.pop();
  let attribsStr = scopeList.pop();
  if (attribsStr === 'attribs') {
    return attribName;
  } else {
    return '';
  }
}

export function makeFakeAstNodeHtml(stringValue, context) {
  let __location = findLocInfoRightSideContext(context);
  if (!__location) {
    throw new Error('makeFakeAstNode did not find a location');
  }
  return {__fakeAstNode: 'T', value: stringValue, __location: __location};
}

export function makeFakeAstNodeHtmlNoLocation(stringValue) {
  return {__fakeAstNode: 'T', value: stringValue};
}

export class HtmlAdapter implements LangAdapter {

  getLang(): string {
    return 'html';
  }

  parseAst(value: string): any {
    return parseAstHtml(value);
  }

  parsePatchAst(value: string, path: string): any {
    return parsePatchAstHtml(value, path);
  }

  printAst(ast: any): string {
    return prettyPrintAstHtml(ast);
  }

  prettyPrintAst(ast: any): string {
    return prettyPrintAstHtml(ast);
  }

  getFieldNamesOnAstNode(ast: any): string[] {
    // Since we have a simplified DOM, just return all of them.
    return Object.keys(ast).filter(name => filterHtmlProperty(name));
  }

  compareAst(oldAst: any, newAst: any): Array<IJsonPatch> {
    return compareAstHtml(oldAst, newAst);
  }

  getAutoPromptForPatch(patch: IJsonPatch): string {
    let {op, path} = patch;
    if (pathHasHtmlAttribs(path)) {
      // Patch for an attribute.
      let scopeList = smartSplit(path, '/');
      let attribName = scopeList.pop();
      let attribsStr = scopeList.pop();
      assert(attribsStr === 'attribs', 'Did not recognize path for patch: ' + path);
      let simplifiedPath = scopeList.join('/');
      let location = describeAstLocationForReplaceDelete(simplifiedPath);
      if (op === 'add') {
        return 'I want you to add attribute ' + attribName + ' to ' + location;
      } else if (op === 'delete') {
        return 'I want you to remove attribute ' + attribName + ' from ' + location;
      } else if (op === 'replace') {
        return 'I want you to change attribute ' + attribName + ' on ' + location;
      } else {
        return 'NYI op: ' + op;
      }
    } else {
      if (op === 'add') {
        let desc = getHumanAstDesc(getAstOnPatch(this, patch));
        return 'I want you to add ' + desc + ' to ' + describeAstLocationForAdd(path);
      } else if (op === 'delete') {
        return 'I want you to remove ' + describeAstLocationForReplaceDelete(path);
      } else if (op === 'replace') {
        return 'I want you to change ' + describeAstLocationForReplaceDelete(path);
      } else {
        return 'NYI op: ' + op;
      }
    }
  }

  computeAddContext(context): string[] {
    let fullStack = makeStackFromDiffContextRight(context);
    return computePartialAddContextForHtml(fullStack);
  }

  computeReplaceDeleteContext(context, replaceDeleteNode): string[] {
    let fullStack = makeStackFromDiffContextLeft(context);
    return computePartialReplaceDeleteContextForHtml(fullStack);
  }

  computeStringDiffContext(context): string[] {
    // TODOfuture: not complete yet.
    let out = [];
    let parentContext = context.parent;
    if (parentContext.childName === 'attribs') {
      // They're adding an attribute.
      out.push(context.childName);
      out.push('attribs');
    } else {
      console.log('computeStringDiffContext problem', context);
      throw new Error('computeStringDiffContext did not recognize context: ' + parentContext.childName);
    }
    // Start stack at parent, since current node is just a string.
    // Actually, parent is the "attribs" node, which we don't want to describe, since we already
    // put it in our "out" list. Plus, If you leave it in, then if there is a "type" attribute
    // we will try to interpret it as a node type attribute.
    let grandparentContext = parentContext.parent;
    let fullStack = makeStackFromDiffContextRight(grandparentContext);
    out = out.concat(computePartialAddContextForHtml(fullStack));
    return out;
  }

  makeFakeAstNode(stringValue, context): any {
    return makeFakeAstNodeHtml(stringValue, context);
  }

  copyAstStripLoc(ast: any): any {
    return stripLocHtml(deepCopy(ast));
  }

  findScopeForAdd(ast: any, scopeList: string[]): any {
    // return new ScoperHtml().findScope(ast, scopeList);  TODOfuture delete this and replace below?
  }

  findScopeForReplace(ast: any, scopeList: string[]): [any, number, any] {
    return null;
  }

  getShortAstDesc(obj, contextName?: string, lastContextName?: string, lastNode?: any): string {
    return getShortAstDescHtml(obj, contextName);
  }
}
