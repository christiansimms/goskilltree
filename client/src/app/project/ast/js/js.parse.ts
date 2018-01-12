import * as recast from 'recast';
import {smartSplit, complain} from "../utils";

declare let esprima: any;

export function parseAstJs(value: string) {
  return recast.parse(value, {parser: esprima});  // Need to pass default value esprima b/c of recast packaging issues.
}

function determineContextFromPath(path) {
  let scopeList = smartSplit(path, '/');
  let usuallyPositionalContext = scopeList.pop();
  // For add and replace, the second one up is the our context, it's our parent.
  let context = scopeList.pop();

  if (usuallyPositionalContext === 'comments') {
    return 'comments';

  } else if (!context) {
    return 'regular';

  } else if (context === 'params') {
    // Parameters in function or class method are same.
    return 'params';

  } else if (context === 'properties') {
    return 'properties';

  } else if (context.startsWith('class ')) {
    // Class context needs a wrapper.
    return 'class';

  } else if (context.startsWith('method ') || context === 'constructor') {
    // Method in class needs special path because of "this".
    return 'class-method';

  } else if (context.startsWith('let ') || context.startsWith('elements') || context === 'init') {
    // Variable declaration, ObjectExpression like {a:1} is not parsed properly by itself.
    return 'variable-init';

  } else {
    // All other contexts are the same.
    return 'regular';
  }
}


export function parsePatchAstJsBasedOnContext(value: string, context: string) {
  let bodyArray;

  if (context === 'comments') {
    let expectChangeAst = parseAstJs(value);
    return expectChangeAst.program.comments;

  } else if (context === 'params') {
    let expectChangeAst = parseAstJs(value);
    return expectChangeAst.program.body[0].expression;  // It's not an array, so we cannot set bodyArray like other conditions here.

  } else if (context === 'properties') {
    value = 'x = {' + value + '}';
    let expectChangeAst = parseAstJs(value);
    bodyArray = expectChangeAst.program.body[0].expression.right.properties;  // Go to actual content.

  } else if (context === 'class') {
    value = 'class dummy { ' + value + '}';
    let expectChangeAst = parseAstJs(value);
    bodyArray = expectChangeAst.program.body[0].body.body;  // Go to actual content.

  } else if (context === 'class-method') {
    value = 'class dummy { method() {' + value + '}}';
    let expectChangeAst = parseAstJs(value);
    bodyArray = expectChangeAst.program.body[0].body.body[0].value.body.body;  // Go to actual content.

  } else if (context === 'variable-init') {
    value = 'x = ' + value;
    let expectChangeAst = parseAstJs(value);
    return expectChangeAst.program.body[0].expression.right;  // Not an array, so cannot set bodyArray.

  } else if (context === 'regular') {
    let expectChangeAst = parseAstJs(value);
    bodyArray = expectChangeAst.program.body;  // Go to actual content.
    // Special case for simple values. 2017-02-27 might not be needed with variable-init condition above.
    if (bodyArray[0].type === 'ExpressionStatement' && bodyArray[0].expression.type === 'Literal') {
      // Get rid of extra level, else diff won't work.
      bodyArray[0] = bodyArray[0].expression;
    }

  } else {
    complain('Unexpected context: ' + context);
  }
  if (bodyArray.length !== 1) {
    complain('smartParseAstFun: Bad size of array: ' + bodyArray.length);
  }
  return bodyArray[0];
}

export function parsePatchAstJs(value: string, path: string) {
  let context = determineContextFromPath(path);
  return parsePatchAstJsBasedOnContext(value, context);
}

export function parseAstWithMultipleThings(value: string) {
  let ast = parseAstJs(value);
  return ast.program.body;  // Return array of actual content.
}


