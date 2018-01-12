import * as parse5 from 'parse5';
import {serialize} from "./html.ser";
import {SimpleHtmlAdapter} from "./html.tree";
import {assert, complain} from "../utils";
import {pathHasHtmlAttribs, makeFakeAstNodeHtmlNoLocation} from "./html.desc";
import {deepCopy} from "../../../common/jsutils";

// const treeAdapter = SimpleHtmlAdapter;   wow, bad idea: parser gets stuck in infinite loop b/c no working detachNode
const treeAdapter = parse5.treeAdapters.htmlparser2;
const parse5ParserOptions = <any>{treeAdapter: treeAdapter, locationInfo: true};


// Delete pure white space text nodes, for easy ast comparison.
// 2017-02-19: call .trim() on content, so that prettyPrintAstHtml's addition
// of white space does not cause problems when applying patches.
// 2017-02-22: hack up template nodes so they're normal
function removeWhiteSpace(ast) {

  // Possibly change children.
  if (treeAdapter.isElementNode(ast) && ast.name === 'template') {
    // Hello special case! These always have 1 child root, and real children below that.
    assert(ast.children.length === 1, 'Bad template node');
    let templateFragmentRoot = ast.children[0];
    ast.children = templateFragmentRoot.children;  // Bam, change the DOM.
  }

  // Recurse.
  let childNodes = treeAdapter.getChildNodes(ast);
  if (childNodes) {
    let toDelete = [];
    for (let i = 0, cnLength = childNodes.length; i < cnLength; i++) {
      let currentNode = childNodes[i];
      if (treeAdapter.isElementNode(currentNode)) {
        removeWhiteSpace(currentNode);
      } else if (treeAdapter.isTextNode(currentNode)) {
        let content = treeAdapter.getTextNodeContent(currentNode);
        let trimmedContent = content.trim();
        let isBlank = !trimmedContent;
        if (isBlank) {
          toDelete.push(currentNode);
        } else {
          // Not empty, so store trimmed content. I can't find a DOM function to update data, so we'll just do it ourselves.
          (<any>currentNode).data = trimmedContent;
        }
      } else if (treeAdapter.isCommentNode(currentNode)) {
        // Always keep comments.
      } else if (treeAdapter.isDocumentTypeNode(currentNode)) {
        // Nothing to do.
      } else {
        throw new Error('Bad html AST node');
      }
    }

    // Now that loop is done, delete all bad ones.
    toDelete.forEach(node => {
      treeAdapter.detachNode(node);
      // treeAdapter.deleteChild(ast, node);
    });
  }
}

function copyHtmlLocationInfo(src, tgt) {
  if (src.__location) {
    tgt.__location = deepCopy(src.__location);
  }
}

const adapter = SimpleHtmlAdapter;

function cloneAstHtmlRec(src, tgt) {
  let childNodes = adapter.getChildNodes(src);
  if (childNodes) {
    for (let i = 0, cnLength = childNodes.length; i < cnLength; i++) {
      let currentNode = childNodes[i];

      if (adapter.isElementNode(currentNode)) {
        let newNode = adapter.createElement(adapter.getTagName(currentNode), adapter.getNamespaceURI(currentNode), adapter.getAttrList(currentNode));
        copyHtmlLocationInfo(currentNode, newNode);
        adapter.appendChild(tgt, newNode);
        cloneAstHtmlRec(currentNode, newNode);  // Only place where we recurse thru elements.

      } else if (adapter.isTextNode(currentNode)) {
        let content = adapter.getTextNodeContent(currentNode);
        let newNode = adapter.createTextNode(content);
        copyHtmlLocationInfo(currentNode, newNode);
        adapter.appendChild(tgt, newNode);

      } else if (adapter.isCommentNode(currentNode)) {
        let content = adapter.getCommentNodeContent(currentNode);
        let newNode = adapter.createCommentNode(content);
        copyHtmlLocationInfo(currentNode, newNode);
        adapter.appendChild(tgt, newNode);

      } else if (adapter.isDocumentTypeNode(currentNode)) {
        adapter.setDocumentType(tgt,
          adapter.getDocumentTypeNodeName(currentNode),
          adapter.getDocumentTypeNodePublicId(currentNode),
          adapter.getDocumentTypeNodeSystemId(currentNode)
        );

      } else {
        throw new Error('Bad html AST node');
      }
    }
  }
}

// Return a new dom which is json-friendly, no cycles.
function cloneAstHtml(ast) {
  assert(ast.type === 'root', 'Bad ast');
  let root = adapter.createDocumentFragment();
  cloneAstHtmlRec(ast, root);
  return root;
}

export function parseAstHtml(value: string): any {
  // Use htmlparser2 adapter, since it puts attributes in a dictionary where order doesn't matter, but default
  // parse5 puts them in a list/array.
  let ast;
  let valueLower = value.toLowerCase();
  let isWholeDoc = valueLower.startsWith('<!doctype') || valueLower.startsWith('<html');
  if (isWholeDoc) {
    ast = parse5.parse(value, parse5ParserOptions);
    // return parse5.parse(value);
  } else {
    ast = parse5.parseFragment(value, parse5ParserOptions);
  }
  removeWhiteSpace(ast);
  return cloneAstHtml(ast);
}

export function parsePatchAstHtml(value: string, path: string): any {
  if (pathHasHtmlAttribs(path)) {
    // Patch for an attribute is just a string, its value.
    // return value;
    return makeFakeAstNodeHtmlNoLocation(value);
  } else {
    let bodyArray;
    let ast = parseAstHtml(value);
    bodyArray = ast.children;  // Go to actual content.
    if (bodyArray.length !== 1) {
      complain('parsePatchAstHtml: Bad size of array: ' + bodyArray.length);
    }
    return bodyArray[0];
  }
}

// Print out as is. NOT pretty.
export function prettyPrintAstHtml(ast): string {
  // Bummer, parse5.serialize returns innerHTML and does not include root node.
  // And recommended workaround is: https://github.com/inikulin/parse5/issues/118
  // Which is pretty good, but don't use appendChild in fake document fragment or else we'll modify ast.
  // return parse5.serialize(ast, parse5ParserOptions);

  // const docFragment = treeAdapter.createDocumentFragment();
  // // treeAdapter.appendChild(docFragment, ast);
  // (<any>docFragment).children.push(ast);
  // return parse5.serialize(docFragment, parse5ParserOptions);

  return serialize(ast);
}


