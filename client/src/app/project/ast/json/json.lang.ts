import {LangAdapter, makeJsonLangSafeByCopying} from "../utils";
import {IJsonPatch, compareAstJson} from "../astdiff";

function getShortAstDescJson(obj, contextName): string {
  if (obj && obj.id) {  // 2017-03-10: moved this condition ahead of contextName
    return 'id=' + obj.id;
  } else if (contextName) {
    return contextName;
  } else {
    // Must be something we don't care about.
    return null;
  }
}

// Return deepest part with: /id=xxx
// List comes in opposite order, e.g., ["children", "id=4", "children", "id=3"]
function simplifyStack(lst: string[]): string[] {
  for (let index = 0; index < lst.length; index++) {
    if (lst[index].startsWith('id=')) {
      // Found one.
      return lst.slice(0, index + 1);
    }
  }

  // Not found.
  return lst;
}


// Below, we're storing the json structure in patches and the database.
export class JsonAdapter implements LangAdapter {

  getLang(): string {
    return 'json';
  }

  parseAst(value: string): any {
    return makeJsonLangSafeByCopying(value);
  }

  parsePatchAst(value: string, path: string): any {
    return makeJsonLangSafeByCopying(value);
  }

  printAst(ast: any): string {
    return makeJsonLangSafeByCopying(ast);
  }

  prettyPrintAst(ast: any): string {
    return makeJsonLangSafeByCopying(ast);
  }

  getFieldNamesOnAstNode(ast: any): string[] {
    // Since we have a simplified DOM, just return all of them.
    return Object.keys(ast);  // .filter(name => filterHtmlProperty(name));
  }

  compareAst(oldAst: any, newAst: any): Array<IJsonPatch> {
    // 2017-04-17: New file entries are created as [], not null, that's why we have check below.
    if (oldAst === null || oldAst.length === 0) {
      // Assume add.
      let patch: IJsonPatch = {op: 'add_file', path: '', value: newAst, prettyValue: makeJsonLangSafeByCopying(newAst)};
      return [patch];
    } else {
      return compareAstJson(oldAst, newAst);
    }
  }

  getAutoPromptForPatch(patch: IJsonPatch): string {
    return 'I want you to ' + patch.op + ' at ' + patch.path; // Rough, but doesn't matter since user does not edit json.
  }

  computeAddContext(context): string[] {
    let out = [];
    let lastChildName = null;
    let lastNode = null;
    while (context) {
      let node = context.right;  // Additions come from right, not left.
      let contextDesc = this.getShortAstDesc(node, context.childName, lastChildName, lastNode);
      lastChildName = context.childName;
      lastNode = node;
      if (contextDesc) {
        out.push(contextDesc);
      }
      context = context.parent;
    }
    out = simplifyStack(out);
    return out;
  }

  computeReplaceDeleteContext(context, replaceDeleteNode): string[] {
    let out = [];
    let lastChildName = null;
    let lastNode = replaceDeleteNode;
    while (context) {
      let node = context.left;  // Deletions come from left, not right.
      let contextDesc = this.getShortAstDesc(node, context.childName, lastChildName, lastNode);
      lastChildName = context.childName;
      lastNode = node;
      if (contextDesc) {
        out.push(contextDesc);
      }
      context = context.parent;
    }
    out = simplifyStack(out);
    return out;
  }

  computeStringDiffContext(context): string[] {
    return this.computeReplaceDeleteContext(context, /*replaceDeleteNode=*/null);
  }

  makeFakeAstNode(stringValue, context): any {
    return null; // makeFakeAstNodeHtml(stringValue, context);
  }

  copyAstStripLoc(ast: any): any {
    return makeJsonLangSafeByCopying(ast);
  }

  findScopeForAdd(ast: any, scopeList: string[]): any {
    // return new ScoperHtml().findScope(ast, scopeList);  TODOfuture delete this and replace below?
  }

  findScopeForReplace(ast: any, scopeList: string[]): [any, number, any] {
    return null;
  }

  getShortAstDesc(obj, contextName?: string, lastContextName?: string, lastNode?: any): string {
    return getShortAstDescJson(obj, contextName);
  }
}
