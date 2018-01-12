import * as recast from 'recast';
import {
  smartSplit, prettyPrintAstJs, complain, LangAdapter, printAstJs, assert, getLangAdapter, isNullOrUndefined
} from "./utils";
import {
  IJsonPatch, getAstOnPatch, compareAstJs,
  getUniqueStatementDesc, deepVisit
} from "./astdiff";
import {isArray} from "../../common/type-helper";
import {parseAstJs, parsePatchAstJs} from "./js/js.parse";
import {deepCopy} from "../../common/jsutils";


// Return if: Vue.component(...)
function isVueComponent(obj) {
  if (obj.type === 'ExpressionStatement' && obj.expression.type === 'CallExpression') {
    let callee = obj.expression.callee;
    if (callee.type === 'MemberExpression') {
      return callee.object.name === 'Vue' && callee.property.name === 'component';
    }
  }

  // Otherwise: nope.
  return false;
}


function getVueComponentId(obj) {
  let args = obj.expression.arguments;
  return 'Vue.component#' + args[0].value;
}

function parseVueComponentId(pathPart) {
  return pathPart.split('Vue.component#')[1];
}

function isVueComponentPathPart(pathPart) {
  return pathPart.startsWith('Vue.component#');
}

// Similar to Vue.component() but for let vm = new Vue()
// Format looks like: /let vm/init/arguments[0]/properties/#last
function isNewVueDecl(scopeList): boolean {
  if (scopeList.length >= 3) {
    return scopeList[0] === 'let vm' && scopeList[1] === 'init' && scopeList[2] === 'arguments[0]';
  } else {
    return false;
  }
}


export function smartCache(obj) {
  // Handle class + function declarations specially for cases like function() {} getting filled in.
  // console.log('DEBUG.smartCache: ' + obj.type);
  if (obj.type === "ClassDeclaration") {
    return 'class ' + obj.id.name;
  } else if (obj.type === "FunctionDeclaration") {
    return 'function ' + obj.id.name;
  } else if (obj.type === "MethodDefinition") {
    return 'method ' + obj.key.name;
  } else if (isVueComponent(obj)) {
    return getVueComponentId(obj);
    // } else if (isVueDeclaration(obj) || isVueDeclarator(obj)) {
    //   return 'let vm';
  } else if (obj.type === "ObjectExpression") { // needed for vue components
    return obj.type;
  } else if (obj.type === "Property") { // needed for vue components. // Don't include its value, so that it can change.
    return 'property:' + obj.key.name;

  // 2017-12-28: remove this also, that way all statements are treated as complete blocks.
  // } else if (obj.type === "ReturnStatement") { // needed for vue components, data property.
  //   return 'return';

    // 2017-12-6: disabled below 2 parts, VariableDeclaration and VariableDeclarator, so that we could handle
    // changing "let a = 1" to "let a = 1 * 2" (for javascript tutorial). So we're removing old Vue support.
    // Disable below unless you're ready to handle all complexities with fine-grained editing of variable changes.
  // } else if (obj.type === "VariableDeclaration") {  // cache these special so you can change their value easily
  //   let declarations = obj.declarations;
  //   if (declarations.length === 1) {
  //     let identifier = declarations[0].id.name;
  //     return 'let ' + identifier;
  //   } else {
  //     return 'ERROR-cannot handle more than 1 variable declaration together: ' + JSON.stringify(declarations);
  //   }
  // } else if (obj.type === "VariableDeclarator") {  // cache these special so you can change their value easily
  //   let identifier = obj.id.name;
  //   return 'let ' + identifier;

  } else if (obj.type === "IfStatement") { // needed for editing inside if statement
    return 'if';

  } else if (isArray(obj)) {
    // Comments.
    let firstObj = obj[0];
    if (firstObj) {
      assert(firstObj.type === 'Line' || firstObj.type === 'Block', 'Should be a comment');
    }
    let comments = obj.map(item => {
      if (item.type === 'Line') {
        return '//' + item.value;
      } else if (item.type === 'Block') {
        return '/*' + item.value + '*/';
      } else {
        throw new Error('Bad comment item: ' + item.type);
      }
    });
    return comments.join('\n');

  } else {
    //noinspection UnnecessaryLocalVariableJS
    let str = prettyPrintAstJs(obj);
    return str;  // smartSplit(str, '\n')[0];   2017-02-10 stopped this b/c of multi-line vue inits
  }
}

export function isStatementAst(ast): boolean {
  return ast.type === 'VariableDeclaration' || ast.type === 'ExpressionStatement';
}

// Describe location for both add, replace and delete (i.e., common).
function commonDescribeAstLocation(scopeList): string[] {
  let out = [];

  // Before chopping up scopeList, check special case.
  if (scopeList.length === 0) {
    out.push('the file');
    return out;
  }

  // 2017-06-12: Why did I write this? It makes prompt harder to understand.
  // Apparently I wrote it for deeper paths.
  if (scopeList.length >= 2 && scopeList[0].startsWith('class') && scopeList[1].startsWith('method')) {
    let className = scopeList[0].substring('class'.length).trim();
    let methodName = scopeList[1].substring('method'.length).trim();
    out.push('method ' + className + '.' + methodName);
    scopeList.shift();
    scopeList.shift();
  }

  // Handle Vue definitions specially, since they're so long.
  if ((scopeList.length >= 1 && isVueComponentPathPart(scopeList[0])) || isNewVueDecl(scopeList)) {
    // Samples of Vue.component:
    //   add a method:       /Vue.component#comp2/arguments[1]/properties[methods]/properties/#first
    //   change to a method: /Vue.component#comp3/arguments[1]/properties[methods]/properties[method1]/#first
    // Remove the 2 top parts of path.
    // Samples of new Vue:
    //   add a property: /let vm/init/arguments[0]/properties/#last
    let vueComponentPath = '';
    if (isNewVueDecl(scopeList)) {
      scopeList.shift();
      scopeList.shift();
      scopeList.shift();
    } else {
      // Must be a Vue.component.
      vueComponentPath = scopeList.shift();
      scopeList.shift();
    }
    if (scopeList.length >= 2 && scopeList[0] === 'properties[methods]') {
      // Dealing with a method.

      if (scopeList[1] === 'properties') {
        // Adding a method.
        return ['ERROR - did not expect an add in replace/delete: ' + scopeList];

      } else if (scopeList[1].startsWith('properties[')) {
        let methodName = scopeList[1].split('[')[1].replace(']', '');
        if (scopeList.length > 2) {
          // Add last item to description list.
          let lastDesc = describeUniqueStatementDesc(scopeList[scopeList.length - 1]);
          out.push(lastDesc);
        }
        out.push('method ' + methodName);

      } else {
        return ['TODO - describeAstLocationForReplaceDelete: ' + scopeList];
      }
    } else {
      // Default handling.
      scopeList.forEach(scope => {
        out.push(describeUniqueStatementDesc(scope));
      });
      out.reverse();
    }
    if (vueComponentPath) {
      out.push('Vue component "' + parseVueComponentId(vueComponentPath) + '"');
    } else {
      out.push('Vue declaration');
    }

  } else if (scopeList.length > 0) {
    scopeList.forEach(scope => {
      out.push(describeUniqueStatementDesc(scope));
    });
    out.reverse();
  } else {
    // Empty list handled above.
    // out.push('the file');
  }
  return out;
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
    let goesAtBeg: string = '';
    let goesAtEnd: string = '';
    if (positionCode === '#first') {
      goesAtBeg = 'the beginning of ';
    } else if (positionCode === '#last') {
      goesAtBeg = 'the end of ';
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

    let descs = commonDescribeAstLocation(scopeList);
    out.push(...descs);  // Use the new spread operator.
    return goesAtBeg + out.join(' in ') + goesAtEnd;
  }
}

function describeAstLocationForReplaceDelete(path) {
  let scopeList = smartSplit(path, '/');
  let out = commonDescribeAstLocation(scopeList);
  return out.join(' in ');
}


// Return short unique description like "line()" or "let abc". Keep in sync: getShortAstDescJs and getHumanAstDesc.
export function getShortAstDescJs(obj, contextName: string, lastContextName?: string, lastNode?: any) {
  if (contextName === 'init') {
    // Always include variable initialization in path.
    return contextName;
  } else if ((obj === null) || (obj === undefined) || !obj.type) {  // undefined happens when comments are added
    if (contextName === 'properties') {
      // Slightly subtle: the only time we need to print "properties" is if it's the last item in the stack.
      // Otherwise we will be inside a value and the output will come from getAstDesc as: properties[name].
      if (lastNode === null) {
        return contextName;
      }
    } else if (contextName === 'body') {
      return null;
    } else if (contextName === 'declarations') {
      return null;
    } else if (contextName === 'elements') {
      // Handle an array.
      if (lastNode) {
        // Find index in array, and include that.
        assert(isArray(obj), 'Expected an array');
        let index = obj.indexOf(lastNode);
        return 'elements[' + index + ']';
      } else {
        return contextName;
      }
    } else {
      // Make sure to handle value 0, so cannot use simple condition.
      if (!isNullOrUndefined(lastContextName)) {
        return contextName + '[' + lastContextName + ']';
      } else {
        return contextName;
      }
    }
  } else {
    return getAstDesc(obj, /*short=*/true);
  }
}

// Return human description of given obj, e.g. constructor, class Bullet. Keep in sync: getShortAstDescJs and getHumanAstDesc.
function getHumanAstDesc(obj): string {
  return getAstDesc(obj, /*short=*/false);
}

function getAstDesc(obj, short: boolean) {
  if (obj.type === "Program" || obj.type === "File" || obj.type === 'BlockStatement' || obj.type === 'FunctionExpression' || obj.type === 'ClassBody') {
    // Top-level, nothing to say.
  } else if (obj.type === "ClassDeclaration") {
    return /*short ?*/ 'class ' + obj.id.name;
  } else if (obj.type === "FunctionDeclaration") {
    return /*short ?*/ 'function ' + obj.id.name;
  } else if (obj.type === "MethodDefinition") {
    /*short ?*/
    if (obj.kind === 'constructor') {
      return 'constructor';
    } else {
      return 'method ' + obj.key.name;
    }
  } else if (isVueComponent(obj)) {  // Make sure to put this special case before ExpressionStatement, since it is one.
    return getVueComponentId(obj);
  } else if (obj.type === "ExpressionStatement") {
    if (obj.expression.type === 'CallExpression') {
      let callee = obj.expression.callee;

      if (callee.type === 'Identifier') {
        // Simple function call.
        return short ? callee.name + '()' : 'call on function ' + callee.name;

      } else if (callee.type === 'MemberExpression') {
        if (callee.object.type === 'Identifier') {
          return short ? callee.object.name + "." + callee.property.name + '()' :
            'call on method ' + callee.object.name + "." + callee.property.name;
        } else if (callee.object.type === 'ThisExpression') {
          return short ? "this." + callee.property.name + '()' :
            'call on method this.' + callee.property.name;
        } else if (callee.object.type === 'MemberExpression') {
          if (callee.object.object.type === 'ThisExpression') {
            if (short) {
              return 'this.' + callee.object.property.name + '.' + callee.property.name + '()';
            } else {
              // return 'call on method ' + callee.property.name + '() on this.' + callee.object.property.name;
              return 'call on this.' + callee.object.property.name + '.' + callee.property.name + '()';
            }
          } else {
            return 'TODO - unknown MemberExpression/MemberExpression';
          }
        } else {
          return 'TODO - unknown MemberExpression';
        }

      } else {
        return 'TODO - unknown CallExpression';
      }
    } else if (obj.expression.type === 'AssignmentExpression') {
      let left = obj.expression.left;

      if (left.type === 'Identifier') {
        // It's like: x=
        let identifier = left.name;
        return short ? identifier + '=' : 'assignment to ' + identifier;

      } else if (left.type === 'MemberExpression') {
        if (left.object.type === 'Identifier') {
          return short ? left.object.name + "." + left.property.name + '=' :
            'assignment to ' + left.object.name + "." + left.property.name;
        } else if (left.object.type === 'ThisExpression') {
          return short ? "this." + left.property.name + '=' :
            'assignment to this.' + left.property.name;
        } else {
          return 'TODO - unknown MemberExpression';
        }

      } else {
        return 'TODO - unknown AssignmentExpression';
      }
    } else {
      return 'statement (TODO details)';
    }
  } else if (obj.type === 'VariableDeclarator') {
    // Nothing to say, this is just a container of VariableDeclaration.
  } else if (obj.type === 'VariableDeclaration') {
    let identifier = obj.declarations[0].id.name;
    return short ? 'let ' + identifier : 'declaration of variable ' + identifier;
  } else if (obj.type === 'IfStatement') {
    return 'if';
  } else if (obj.type === 'Identifier') {
    return obj.name;
  } else if (obj.type === 'Property') {
    return short ? 'properties[' + obj.key.name + ']' : 'attribute "' + obj.key.name + '"';
  } else if (obj.type === 'Literal') {
    if (short) {
      // 2017-06-13: Our context code, like getShortAstDescJs, expects no return for this, so let's keep it happy!
      return undefined;
    } else {
      return 'string';  // 2017-06-12 added for vue prompting
    }
  } else if (obj.type === 'ObjectExpression' || obj.type === 'ArrayExpression' || obj.type === 'CallExpression') {
    // Nothing to say.
  } else if (obj.type === 'NewExpression') {
    return 'new ' + obj.callee.name;
  } else if (obj.type === "ReturnStatement") { // needed for vue components, data property.
    return 'return';
  } else if (obj.type === "Line" || obj.type === "Block") {
    // return 'comment';
  } else {
    complain('TODO - how to describe AST node: ' + obj.type);
  }
}


// Parse output of getUniqueStatementDesc. Pretty rough right now.
// Keep findOneScopeJs and describeUniqueStatementDesc sort of in sync.
function describeUniqueStatementDesc(desc): string {
  if (desc.indexOf('()') >= 0) {
    // It's a function call.
    return 'the call on ' + desc;
  } else if (desc.includes('[')) {
    // Must be something like arguments[1]
    let [arrayName, arrayIndex] = desc.split('[');
    arrayIndex = arrayIndex.slice(0, -1);  // remove trailing ]
    if (arrayName === 'properties') {
      return 'attribute "' + arrayIndex + '"';
    } else if (arrayName === 'arguments') {
      return 'argument #' + arrayIndex;
    } else if (arrayName === 'elements') {
      return 'array element #' + arrayIndex;
    } else {
      return desc;
    }
  } else {
    return desc;
  }
}

// Strip .loc attributes, to avoid confusing recast when it's reprinting.
function stripLocJs(ast) {
  deepVisit(ast, item => delete item.loc);
  return ast;
}

// Return prompt for patch.
export class EcmascriptAdapter implements LangAdapter {

  getLang(): string {
    return 'js';
  }

  parseAst(value: string): any {
    return parseAstJs(value);
  }

  parsePatchAst(value: string, path: string): any {
    return parsePatchAstJs(value, path);
  }

  printAst(ast: any): string {
    return printAstJs(ast);
  }

  prettyPrintAst(ast: any): string {
    return prettyPrintAstJs(ast);
  }

  getFieldNamesOnAstNode(ast: any): string[] {
    return recast.types.getFieldNames(ast);
  }

  compareAst(oldAst: any, newAst: any): Array<IJsonPatch> {
    return compareAstJs(oldAst, newAst);
  }

  getAutoPromptForPatch(patch: IJsonPatch): string {
    let {op, path} = patch;
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

  computeAddContext(context): string[] {
    let out = [];
    let lastChildName = null;
    let lastNode = null;
    while (context) {
      let node = context.right;  // Additions come from right, not left.
      let contextDesc = getShortAstDescJs(node, context.childName, lastChildName, lastNode);
      lastChildName = context.childName;
      lastNode = node;
      if (contextDesc) {
        out.push(contextDesc);
      }
      context = context.parent;
    }
    return out;
  }

  computeReplaceDeleteContext(context, replaceDeleteNode): string[] {
    let out = [];
    let lastChildName = null;
    let lastNode = replaceDeleteNode;
    while (context) {
      let node = context.left;  // Deletions come from left, not right.
      let contextDesc = getShortAstDescJs(node, context.childName, lastChildName, lastNode);
      lastChildName = context.childName;
      lastNode = node;
      if (contextDesc) {
        out.push(contextDesc);
      }
      context = context.parent;
    }
    return out;
  }

  computeStringDiffContext(context): string[] {
    return this.computeReplaceDeleteContext(context, /*replaceDeleteNode=*/null);
  }

  // Maybe rename to: getAstNodeFromStringDiff
  makeFakeAstNode(stringValue, context): any {
    let node = context.parent.right;
    assert(node, 'Did not find parent AST node of string');
    return node;
  }

  copyAstStripLoc(ast: any): any {
    return stripLocJs(deepCopy(ast));
  }

  findScopeForAdd(ast: any, scopeList: string[]): any {
    throw new Error('TODO-remove');
  }

  findScopeForReplace(ast: any, scopeList: string[]): [any, number, any] {
    throw new Error('TODO-remove');
  }

  getShortAstDesc(obj, contextName?: string, lastContextName?: string, lastNode?: any): string {
    return getShortAstDescJs(obj, contextName, lastContextName, lastNode);
  }
}

// Helper for applying patches.
export class ScoperJs {
  mode: string;
  arrayPosition: string;
  itemToDelete: string;

  constructor(public jsonPatch: IJsonPatch) {
    this.mode = 'top';
  }

  findScope(ast: any) {
    let scopeList = smartSplit(this.jsonPatch.path, '/');
    if (this.jsonPatch.op === 'add') {
      // Yank out special positional stuff at end.
      let lastScope = scopeList.slice(-1)[0];
      if (lastScope.startsWith('#')) {
        // Remember + remove it.
        this.arrayPosition = lastScope;
        scopeList.pop();
      }
    } else if (this.jsonPatch.op === 'replace' || this.jsonPatch.op === 'delete') {
      // Yank out special positional item at end.
      this.itemToDelete = scopeList.pop();
    } else {
      throw new Error('Bad op: ' + this.jsonPatch.op);
    }

    // Go through scopes.
    // Start at first real scope.
    let currentScope = ast.program.body;
    while (scopeList.length > 0) {
      let desiredScopeDesc = scopeList.shift();  // get first one in list
      let newScope = this.findOneScopeJs(currentScope, desiredScopeDesc);
      if (!newScope) {
        // This is really just here to make debugging easy.
        throw new Error('findScope did not find scope: ' + desiredScopeDesc);
      }
      currentScope = newScope;
    }

    return currentScope;
  }

  findDeletePosition(currentScope): number {
    // Find item to delete in current scope.
    for (let position = 0; position < currentScope.length; position++) {
      let desc = getUniqueStatementDesc(getLangAdapter('js'), currentScope, position);
      if (desc === this.itemToDelete) {
        // Found it!
        return position;
      }
    }
    throw new Error('Did not find item to replace/delete: ' + this.itemToDelete);
  }

  // Keep findOneScopeJs and describeUniqueStatementDesc sort of in sync.
  findOneScopeJs(ast, desiredScopeDesc: string): any {
    if (desiredScopeDesc === '#first') {
      if (isArray(ast)) {
        return ast[0];
      } else {
        throw new Error('Did not find array for #first' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.startsWith('class ')) {
      let className = desiredScopeDesc.split(' ')[1];
      let matches = ast.filter(item => item.type === "ClassDeclaration" && item.id.name === className);
      if (matches.length > 0) {
        let match = matches[0];
        return match.body.body;
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.startsWith('function ')) {
      let functionName = desiredScopeDesc.split(' ')[1];
      let matches = ast.filter(item => item.type === "FunctionDeclaration" && item.id.name === functionName);
      if (matches.length > 0) {
        return matches[0];
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.startsWith('constructor')) {
      let matches = ast.filter(item => item.type === "MethodDefinition" && item.kind === 'constructor');
      if (matches.length > 0) {
        return matches[0];
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.startsWith('method ')) {
      let methodName = desiredScopeDesc.split(' ')[1];
      let matches = ast.filter(item => item.type === "MethodDefinition" && item.kind === 'method' && item.key.name === methodName);
      if (matches.length > 0) {
        return matches[0];
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc === 'for') {
      // Find the first for loop.
      let matches = ast.filter(item => item.type === "ForStatement");
      if (matches.length > 0) {
        let match = matches[0];
        return match.body.body;
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.startsWith('if')) {
      // Find the first if statement.  2017-05-15 added findDefaultBodyOfAstJs to handle fine-grain editing of if-stmts.
      let matches = this.findDefaultBodyOfAstJs(ast).filter(item => item.type === "IfStatement");
      if (matches.length > 0) {
        let match = matches[0];
        return match.consequent.body;
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc === 'forEach') {
      // Find the first for loop.
      let matches = ast.filter(item => {
        if (item.type === "ExpressionStatement"
          && item.expression.type === "CallExpression") {
          let callee = item.expression.callee;
          if (callee.type === "MemberExpression" && callee.property.name === "forEach") {
            return true;
          }
        }
      });
      if (matches.length > 0) {
        let match = matches[0];
        return match.expression.arguments[0].body.body;
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc === 'params') {
      if (ast.type === 'MethodDefinition') {
        return ast.value.params;
      } else {
        return ast.params;
      }
    } else if (desiredScopeDesc.startsWith('let ')) {
      let varName = desiredScopeDesc.split(' ')[1];
      let matches = this.findDefaultBodyOfAstJs(ast).filter(item => {
        if (item.type === "VariableDeclaration") {
          let declaration = item.declarations[0];
          if (declaration.type === "VariableDeclarator" && declaration.id.name === varName) {
            return true;
          }
        }
      });
      if (matches.length > 0) {
        return matches[0];  // crs EXP. match.declarations[0];
      } else {
        throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.startsWith('new ')) {
      if (ast.type === 'VariableDeclaration') {
        let declaration = ast.declarations[0];
        return declaration.init;
      } else {
        return ast.init.arguments[0].properties;  // Assume it's first property in object expression
      }
    } else if (desiredScopeDesc === 'init') {
      if (ast.type === 'VariableDeclaration') {
        let declaration = ast.declarations[0];
        return declaration.init;
      } else {
        return ast.init;
      }
    } else if (isVueComponentPathPart(desiredScopeDesc)) {
      const langAdapter = getLangAdapter('js');
      for (let position = 0; position < ast.length; position++) {
        let desc = getUniqueStatementDesc(langAdapter, ast, position);
        if (desc === desiredScopeDesc) {
          // Found it!
          return ast[position];
        }
      }
      throw new Error('Did not find: ' + desiredScopeDesc);
    } else if (desiredScopeDesc.startsWith('property:')) {
      let propertyName = desiredScopeDesc.split(':')[1];
      if (isVueComponent(ast)) {
        // Vue components are farther down.
        ast = ast.expression.arguments[1].properties;
      }
      let matches = ast.filter(item => item.key.name === propertyName);
      if (matches.length > 0) {
        return matches[0];
      } else {
        return null;  // If they're adding a property, then they won't find it.
        // throw new Error('Did not find: ' + desiredScopeDesc);
      }
    } else if (desiredScopeDesc.includes('[')) {
      // Must be something like arguments[1]
      let [arrayName, arrayIndex] = desiredScopeDesc.split('[');
      arrayIndex = arrayIndex.slice(0, -1);  // remove trailing ]
      if (ast.type === 'ExpressionStatement' && ast.expression.type === 'CallExpression') {
        // Function call.
        assert(arrayName === 'arguments', 'Bad array scope: ' + arrayName);
        let args = ast.expression.arguments;
        return args[+arrayIndex];
      } else if (arrayName === 'properties') {
        let searchScope;
        if (ast.type === 'ObjectExpression') {
          searchScope = ast.properties;
        } else if (ast.type === 'Property') {
          searchScope = ast.value.properties;
        } else {
          throw new Error('Unknown properties ast type: ' + ast.type);
        }
        let matches = searchScope.filter(item => item.key.name === arrayIndex);
        if (matches.length > 0) {
          return matches[0];
        } else {
          return null;
        }
      } else if (arrayName === 'arguments') {
        return ast.arguments[+arrayIndex];
      } else if (arrayName === 'elements') {
        let realAst = this.findDefaultBodyOfAstJs(ast);  // Need to call this if we're inside a property.
        return realAst.elements[+arrayIndex];
      } else {
        throw new Error('NYI array scope on: ' + ast.type);
      }
    } else if (desiredScopeDesc === 'properties') {  // 2017-02-25: I think this is dead code.
      if (ast.type === 'ReturnStatement') {
        // This is supporting vue.
        return ast.argument.properties;
      } else if (ast.type === 'Property') {
        // This is supporting vue.
        return ast.value;
      } else {
        return ast.properties;
      }

    } else if (desiredScopeDesc === 'return') {
      if (ast.type === 'Property') {
        // Must be a return statement inside a function.
        let statement = ast.value.body.body[0];
        assert(statement.type === 'ReturnStatement', 'Did not find expected return statement');
        return statement;
      } else {
        throw new Error('TODO-findOneScopeJs handle return');
      }

    } else if (desiredScopeDesc === 'elements') {
      if (ast.type === 'Property') {
        // Must be an array inside a dict property. 2017-06-07: kind of ugly, caused by properties[] not returning .value .
        ast = ast.value;
      }
      return ast.elements;

    } else if (desiredScopeDesc === 'comments') {
      // Go to where comment actually goes.
      if (ast.type === "FunctionDeclaration") {
        // Comments on functions go on its body.
        ast = ast.body;
      } else {
        throw new Error('findOneScopeJs unknown context: ' + ast.type);
      }

      // Create an empty comments array if it doesn't exist.
      if (!ast.comments) {
        ast.comments = [];
      }
      return ast.comments;

    } else {
      console.log('DEBUG.findOneScopeJs scope: ', ast);
      throw new Error('NYI findOneScopeJs: ' + desiredScopeDesc);
    }
  }

  getArrayPosition() {
    return this.arrayPosition;
  }

  //noinspection JSMethodCanBeStatic
  findDefaultBodyOfAstJs(ast, needLocInfo = false) {
    let returnRealValue = !needLocInfo;  // This is just to make code below easier to read.
    if (!ast.type) {
      // Assume it's an array.
      return ast;
    } else if (ast.type === 'MethodDefinition') {
      return returnRealValue ? ast.value.body.body : ast.value.body;
    } else if (ast.type === 'ObjectExpression') {
      return ast.properties;
    } else if (ast.type === 'Property') {
      return this.findDefaultBodyOfAstJs(ast.value, needLocInfo);
    } else if (ast.type === 'VariableDeclaration') {
      return ast.declarations[0];  // Assume only one declaration.
    } else if (ast.type === 'ArrayExpression') {
      return ast;
    } else {
      return returnRealValue ? ast.body.body : ast.body;
    }
  }

  findRealAstNodeForReplaceDelete(ast) {
    assert(this.itemToDelete, 'Missing itemToDelete');
    if (ast.type === 'ReturnStatement' && this.itemToDelete.startsWith('properties')) {
      return ast.argument.properties;
    } else if (ast.type === 'FunctionDeclaration' && this.itemToDelete === 'comments') {
      // Comments on functions go on its body.
      return ast.body;
    } else {
      return this.findDefaultBodyOfAstJs(ast);
    }
  }

  // Intent is to keep performReplace and performDelete in sync, though not there yet (2017-06-14).
  performReplace(scope: any, newAst: any) {
    if (this.itemToDelete === 'comments') {
      // Comments are on a .comments
      scope.comments = newAst;
    } else if (scope.type === 'Property' && this.itemToDelete === 'value') {
      // Properties have a .value
      scope.value = newAst;
    } else if (scope.type === 'VariableDeclaration') {
      assert(this.itemToDelete === 'init', 'Unknown item to delete for variable');
      let declaration = scope.declarations[0];
      declaration.init = newAst;
    } else if (scope.type === 'ArrayExpression') {
      let [arrayName, arrayIndex] = this.itemToDelete.split('[');
      arrayIndex = arrayIndex.slice(0, -1);  // remove trailing ]
      assert(arrayName === 'elements', 'Expected array elements');
      scope.elements[+arrayIndex] = newAst;
    } else {
      scope = this.findRealAstNodeForReplaceDelete(scope);
      scope.splice(this.findDeletePosition(scope), 1, newAst);
    }
  }

  // Intent is to keep performReplace and performDelete in sync, though not there yet (2017-06-14).
  performDelete(origScope: any) {
    // 2017-06-14: if you have an array which is a property, then scope points to the property, but we need to find
    // the real AST node. I wonder if performReplace() has this problem.
    let scope = this.findRealAstNodeForReplaceDelete(origScope);
    if (scope.type === 'ArrayExpression') {
      let [arrayName, arrayIndex] = this.itemToDelete.split('[');
      arrayIndex = arrayIndex.slice(0, -1);  // remove trailing ]
      assert(arrayName === 'elements', 'Expected array elements');
      scope.elements.splice(+arrayIndex, 1);
    } else {
      scope.splice(this.findDeletePosition(scope), 1);
    }
  }
}
