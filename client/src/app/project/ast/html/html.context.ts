import {smartSplit, getLangAdapter} from "../utils";
import {SimpleHtmlAdapter} from "./html.tree";
import {getUniqueStatementDesc, findStatementDescInScope} from "../astdiff";
import {isArray} from "../../../common/type-helper";
import {getShortAstDescHtml} from "./html.desc";

const adapter = SimpleHtmlAdapter;

// Tags that only have one in a document.
const UNIQUE_TAGS = {'html': true, 'head': true, 'body': true};

function simplifyStackWithId(fullStack) {
  for (let index = 0; index < fullStack.length; index++) {
    let obj = fullStack[index];
    let isTag = obj.type === 'tag';
    if (isTag) {
      let uniqueId = obj.attribs.id;
      if (uniqueId) {
        let nodePath = obj.name + '#' + uniqueId;
        return [fullStack.slice(0, index), nodePath];
      } else if (UNIQUE_TAGS[obj.name]) {
        return [fullStack.slice(0, index), obj.name];
      }
    }
  }

  // Oh well, did not find it.
  return [fullStack, null];
}


// Compute path for html given jsondiffpatch context.
export function computePartialAddContextForHtml(fullStack): string[] {

  // Find lowest node with an id.
  const langAdapter = getLangAdapter('html');
  let out = [];
  let idContext;
  [fullStack, idContext] = simplifyStackWithId(fullStack);

  while (fullStack.length > 0) {
    const node = fullStack.shift();  // Get first element on remaining stack.
    const parentScope = fullStack[0];  // Now that we shifted "node", our parent is at the top of the stack.
    let position;
    let contextDesc;
    if (parentScope && isArray(parentScope)) {
      // Try to find us.
      position = parentScope.indexOf(node);
      contextDesc = getUniqueStatementDesc(langAdapter, parentScope, position);
    } else {
      contextDesc = getShortAstDescHtml(node/*, context.childName*/);
    }
    if (contextDesc) {
      out.push(contextDesc);
    }
  }

  // If we have this, it should go at the end of the list.
  if (idContext) {
    out.push(idContext);
  }

  return out;
}

// Compute path for html given jsondiffpatch context.
export function computePartialReplaceDeleteContextForHtml(fullStack): string[] {
  return computePartialAddContextForHtml(fullStack);
}

function findElementLambda(ast, lambda) {
  if (lambda(ast)) {
    // Found it!
    return ast;
  } else {
    // Recurse.
    let childNodes = adapter.getChildNodes(ast);
    if (childNodes) {
      let result = null;
      for (let i = 0, cnLength = childNodes.length; result === null && i < cnLength; i++) {
        let currentNode = childNodes[i];
        if (adapter.isElementNode(currentNode)) {
          result = findElementLambda(currentNode, lambda);
        } else if (adapter.isTextNode(currentNode)) {
          // Cannot match.
        } else if (adapter.isCommentNode(currentNode)) {
          // Cannot match.
        } else if (adapter.isDocumentTypeNode(currentNode)) {
          // Cannot match.
        } else {
          throw new Error('Bad html AST node');
        }
      }
      return result;
    }
  }
}

function findTagWithId(ast, tag, id) {
  function fn(element) {
    return element.type === 'tag' && element.name === tag && element.attribs.id === id;
  }

  return findElementLambda(ast, fn);
}

function findTag(ast, tag) {
  function fn(element) {
    return element.type === 'tag' && element.name === tag;
  }

  return findElementLambda(ast, fn);
}

// Helper for applying patches.
export class ScoperHtml {
  mode: string;
  nodeWithAttributes: any;
  arrayPosition: string;
  attribName: string;
  itemToDelete: string;

  constructor(public op: string) {
    this.mode = 'top';
  }

  isInAttribs() {
    return this.mode === 'attribs';
  }

  findScope(ast: any, scopeList: string[]) {

    if (this.op === 'add') {
      // Yank out special positional stuff at end.
      let lastScope = scopeList.slice(-1)[0];
      if (lastScope.startsWith('#')) {
        // Remember + remove it.
        this.arrayPosition = lastScope;
        scopeList.pop();
      }
    } else if (this.op === 'replace' || this.op === 'delete') {
      // Yank out special positional item at end.
      this.itemToDelete = scopeList.pop();
    } else {
      throw new Error('Bad op: ' + this.op);
    }

    // Go through scopes.
    let currentScope = ast;
    while (scopeList.length > 0) {
      let desiredScopeDesc = scopeList.shift();  // get first one in list
      currentScope = this.findOneScopeHtml(currentScope, desiredScopeDesc);
    }

    return currentScope;
  }

  findDeletePosition(currentScope): number {
    // Find item to delete in current scope.
    for (let position = 0; position < currentScope.length; position++) {
      let desc = getUniqueStatementDesc(getLangAdapter('html'), currentScope, position);
      if (desc === this.itemToDelete) {
        // Found it!
        return position;
      }
    }
    throw new Error('Did not find item to replace/delete: ' + this.itemToDelete);
  }

  findOneScopeHtml(currentScope: any, desiredScopeDesc: string) {
    if (this.mode === 'top') {
      if (desiredScopeDesc.indexOf('#') >= 0) {
        // Find tag#id.
        let [tag, id] = smartSplit(desiredScopeDesc, '#');
        return findTagWithId(currentScope, tag, id);

      } else if (UNIQUE_TAGS[desiredScopeDesc]) {
        return findTag(currentScope, /*tag=*/desiredScopeDesc);

      } else if (desiredScopeDesc === 'attribs') {
        this.nodeWithAttributes = currentScope;
        this.mode = 'attribs';
        return currentScope.attribs;

      } else {
        // Assume it's a tag, but WITHOUT an id.
        let index = findStatementDescInScope(getLangAdapter('html'), currentScope.children, desiredScopeDesc);
        return currentScope.children[index];
      }

    } else if (this.mode === 'attribs') {
      this.attribName = desiredScopeDesc;
      return currentScope[this.attribName];

    } else {
      throw new Error('Bad mode: ' + this.mode);
    }
  }

  getArrayPosition() {
    return this.arrayPosition;
  }
}
