import {
  intrinsicTypes, smartSplit, LangAdapter,
  getLangAdapter, assert, isNullOrUndefined
} from "./utils";
import {smartCache, isStatementAst} from "./ecmascript";
import {applyJsonPatchesFunJs, applyJsonPatchesFunHtml, applyJsonPatchesFunJson} from "./astdiff-apply";
import {prettyPrintAstHtml} from "./html/html.ast";
import {IDeltaEntry} from "../../author/author.service";
import {isArray, isString} from "../../common/type-helper";
import {hasOwn} from "../../common/jsutils";

declare let jsondiffpatch: any;

const debugComputeContext = false;  // true;

// smartTrim was introduced to support json data.
function smartTrim(value: any) {
  if (isString(value)) {
    return value.trim();
  } else {
    return value;
  }
}

export interface IJsonPatch {
  op: string;  // Possible values: add, delete, replace.
  path: string;  // Location of item in AST.
  value: any;  // AST for add, delete or replace.
  prettyValue: string;  // Text being added, deleted or replaced.
}

export function getAstOnPatch(langAdapter: LangAdapter, patch: IJsonPatch) {
  if (!patch.value) {
    patch.value = langAdapter.parsePatchAst(patch.prettyValue, patch.path);
  }
  return patch.value;
}

// Return a shallow copy of the data, cleaned up.
export function cleanCopyPatches(delta: IJsonPatch[]): IJsonPatch[] {
  let out = [];
  delta.forEach(patch => {
    out.push({op: patch.op, path: patch.path, prettyValue: patch.prettyValue});
  });
  return out;
}

export function cleanCopyDelta(delta: IDeltaEntry[]) {
  let out = [];
  delta.forEach((deltaEntry: IDeltaEntry) => {
    let x: IDeltaEntry = {filename: deltaEntry.filename, diffs: cleanCopyPatches(deltaEntry.diffs)};
    out.push(x);
  });
  return out;
}


// Configure an instance of jsondiffpatch with options.
//noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
let jsondiffpatchInstanceJs = jsondiffpatch.create({
  propertyFilter: function (name, context) {
    //noinspection UnnecessaryLocalVariableJS
    let res = name !== 'loc' && name !== 'raw' && name !== '_cache';  // _cache is ours - TODO keep in sync with astdiff-patch
    // if (res) console.log('propertyFilter ', name);
    return res;
  },
  objectHash: function (obj, index) {
    // console.log('DEBUG.objectHash on: ' + obj.type);
    let _cache = obj._cache;
    if (!_cache) {
      _cache = obj._cache = smartCache(obj);
    }
    return _cache;
    // return index;  // This is the default behavior.
  }
});

// Custom filter, read this for details: https://github.com/benjamine/jsondiffpatch/blob/master/docs/plugins.md#plugin-example
let objectTypeChangeDiffFilter = function (context) {
  // Below, watch out, typeof null === 'object'
  if (context.left && context.right && typeof context.left === 'object' && typeof context.right === 'object') {
    // Both are objects, see if their types changed.
    if (context.left.type !== context.right.type) {
      // console.log('DEBUG type changed!');
      window['crsGlobal'](context, [context.left, context.right], 'customObjectPipe');
      context.setResult([context.left, context.right]).exit();
    }
  }
};

// a filterName is useful if I want to allow other filters to be inserted before/after this one
// noinspection TypeScriptUnresolvedVariable
objectTypeChangeDiffFilter['filterName'] = 'numeric';

// to decide where to insert your filter you can look at the pipe's filter list
// console.log(jsondiffpatchInstanceJs.processor.pipes.diff.list());
// It was:  ["collectChildren", "trivial", "dates", "texts", "objects", "arrays"]);

// insert my new filter, right before trivial one
jsondiffpatchInstanceJs.processor.pipes.diff.before('trivial', objectTypeChangeDiffFilter);



function smartCacheHtml(obj) { // TODO: reevaluate, efficient and accurate?
  if (obj.type === 'tag') {
    let uniqueId = obj.attribs.id;
    if (uniqueId) {
      // This way, if an empty element gets children, its cache is the same.
      return obj.name + ' id="' + uniqueId + '"';
    } else {
      return obj.name;
    }
  } else {
    let str = prettyPrintAstHtml(obj);
    //noinspection UnnecessaryLocalVariableJS
    let res = smartSplit(str, '\n')[0];  // .slice(0, 3);  // Return first 3 lines.
    // console.log('DEBUG.smartCacheHtml', res, obj);
    return res;
  }
}

export function filterHtmlProperty(name) {
  return name !== '__location' && name !== '_cache';
}

// Configure an instance of jsondiffpatch with options.
//noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
let jsondiffpatchInstanceHtml = jsondiffpatch.create({
  propertyFilter: function (name, context) {
    return filterHtmlProperty(name);
  },
  objectHash: function (obj, index) {
    // console.log('DEBUG.objectHash on: ' + obj.type);
    let _cache = obj._cache;
    if (!_cache) {
      _cache = obj._cache = smartCacheHtml(obj);
    }
    return _cache;
    // return index;  // This is the default behavior.
  }
});

// Configure an instance of jsondiffpatch with options.
//noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
let jsondiffpatchInstanceJson = jsondiffpatch.create({
  propertyFilter: function (name, context) {
    return true;
  },
  objectHash: function (obj, index) {
    if (obj.id) {
      return obj.id;
    } else {
      return index;  // This is the default behavior.
    }
  }
});


// Generic visit json structure.
export function deepVisit(any, fn) {
  if (!any || typeof any !== 'object') {
    return any;
  }
  if (isArray(any)) {
    for (let i = 0, l = any.length; i < l; ++i) {
      deepVisit(any[i], fn);
    }
  } else if (intrinsicTypes.indexOf(any.constructor) >= 0) {
    // Simple type.
  } else {
    fn(any);
    for (let prop in any) {
      //noinspection JSUnfilteredForInLoop
      if (hasOwn(any, prop)) {
        //noinspection JSUnfilteredForInLoop
        deepVisit(any[prop], fn);
      }
    }
  }
}


// Return short unique description like "line()" or "let abc".
export function getUniqueStatementDesc(langAdapter: LangAdapter, scope, index): string {
  let hash = {};
  let desc;
  for (let counter = 0; counter <= index; counter++) {
    let obj = scope[counter];
    desc = langAdapter.getShortAstDesc(obj);
    if (hash[desc]) {
      hash[desc] += 1;
    } else {
      hash[desc] = 1;
    }
  }

  if (desc === undefined) {
    // Must be a statement which is not displayed, like a Literal.
    return desc;
  }

  let displayCount = hash[desc];
  if (displayCount === 1) {
    return desc;
  } else {
    return desc + ' x' + displayCount;
  }
}

export function findStatementDescInScope(langAdapter: LangAdapter, scope, searchDesc: string) {
  for (let index = 0; index < scope.length; index++) {
    let desc = getUniqueStatementDesc(langAdapter, scope, index);
    if (desc === searchDesc) {
      return index;
    }
  }
  throw new Error('Did not find statement in scope: ' + searchDesc);
}


// Return context of jsondiffpatch context, e.g., /function draw/#first
function computeAddContext(langAdapter: LangAdapter, context, insertion) {
  if (debugComputeContext) {
    console.debug('DEBUG.computeAddContext', context, insertion);
  }
  let out = [];

  // Add last one first.
  // if (langAdapter.getLang() === 'js' && insertion.value.type === 'Property') {
  //   out.push('property:' + insertion.value.key.name);
  // } else {
  let scope = context.right;
  if (insertion.index === 0) {
    out.push('#first');
  } else if (insertion.index === scope.length - 1) {
    out.push('#last');
  } else {
    // Say it's after the previous one.
    // let previousStatement = scope[insertion.index - 1];
    let desc = getUniqueStatementDesc(langAdapter, scope, insertion.index - 1);
    out.push('#after ' + desc);
  }
  // }

  out = out.concat(langAdapter.computeAddContext(context));

  // Return combined value.
  out.reverse();
  return '/' + out.join('/');
}

// Return context of jsondiffpatch context, e.g., /function draw/line()
function computeReplaceOrDeleteContext(langAdapter: LangAdapter, context, deletionIndex: number): string {
  if (debugComputeContext) {
    console.debug('DEBUG.computeReplaceOrDeleteContext', context);
  }
  // Figure out object before we change context.
  let scope = context.left;  // Deletions come from left, not right;
  let replaceDeleteNode = scope[deletionIndex];
  let descOfDeletedObj = getUniqueStatementDesc(langAdapter, scope, deletionIndex);

  // Make scope list.
  let out = [];
  if (descOfDeletedObj) {
    // 2017-02-24: special case for property items -- they don't get added here, instead they're included in parent.
    out.push(descOfDeletedObj);
  }
  out = out.concat(langAdapter.computeReplaceDeleteContext(context, replaceDeleteNode));
  out.reverse();

  return '/' + out.join('/');
}

//noinspection JSUnusedLocalSymbols
function computePathInsideStatement(langAdapter: LangAdapter, context) {
  let path = [];
  while (!isStatementAst(context.left)) {
    let node = context.left;  // Replacements come from left, but could also come from right.
    let contextDesc = langAdapter.getShortAstDesc(node, context.childName);  // Q: does this need lastContextName?
    if (contextDesc) {
      path.push(contextDesc);
    }
    context = context.parent;
  }
  return [path, context];
}

// String diff's have different context than others.
// In others, context.left is the scope of a statement, but for strings it's just the string.
function computeStringDiffContext(langAdapter: LangAdapter, context): string {   // crs: this isn't tested or working yet
  if (debugComputeContext) {
    console.debug('DEBUG.computeStringDiffContext', context);
  }

  let out = langAdapter.computeStringDiffContext(context);
  // if ('a' + 'b' === 'ab') return 'TODO-computeStringDiffContext';
  // let contextWithJustValues = context.parent;
  // assert(contextWithJustValues.left.type === 'Literal', 'Expected a Literal but found a: ' + contextWithJustValues.left.type);
  // //noinspection UnnecessaryLocalVariableJS
  // let [statementPath, statementContext] = computePathInsideStatement(langAdapter, contextWithJustValues);
  //
  // // Make scope list.
  // let out = statementPath;
  // out = out.concat(computeReplaceDeleteContextFromScope(langAdapter, statementContext));
  out.reverse();

  return '/' + out.join('/');
}


// From jsondiffpatch:
const ARRAY_MOVE = 3;

let compare = {
  numerically: function (a, b) {
    return a - b;
  },
  numericallyBy: function (name) {
    return function (a, b) {
      return a[name] - b[name];
    };
  }
};


// Similar to jsondiffpatch's arrays nestedPatchFilter. result is a dict, not an array.
function collectArrayChanges(langAdapter: LangAdapter, context, delta, out) {

  // first, separate removals, insertions and modifications
  let toRemove = [];
  let toInsert = [];
  let toModify = [];
  for (let index in delta) {
    if (delta.hasOwnProperty(index)) {
      if (index !== '_t') {
        if (index[0] === '_') {
          // removed item from original array
          if (delta[index][2] === 0 || delta[index][2] === ARRAY_MOVE) {
            toRemove.push(parseInt(index.slice(1), 10));
          } else {
            throw new Error('only removal or move can be applied at original array indices' +
              ', invalid diff type: ' + delta[index][2]);
          }
        } else {
          if (delta[index].length === 1) {
            // added item at new array
            toInsert.push({
              index: parseInt(index, 10),
              value: delta[index][0]
            });
          } else {
            // modified item at new array
            toModify.push({
              index: parseInt(index, 10),
              delta: delta[index]
            });
          }
        }
      }
    }
  }

  // Detect a replace. This is a crs special. :-)
  if (toRemove.length === 1 && toInsert.length === 1 && toModify.length === 0) {
    let removeIndex = toRemove[0];
    let insertion = toInsert[0];
    let insertIndex = insertion.index;
    if (removeIndex === insertIndex) {
      // It's a replace!
      out.push({
        'op': 'replace',
        'path': computeReplaceOrDeleteContext(langAdapter, context, removeIndex),
        'value': insertion.value,
        'prettyValue': langAdapter.printAst(insertion.value)
      });
      return;
    }
  }

  // remove items, in reverse order to avoid sawing our own floor
  let array = context.left;
  toRemove = toRemove.sort(compare.numerically);
  for (let index = toRemove.length - 1; index >= 0; index--) {
    let index1 = toRemove[index];
    let indexDiff = delta['_' + index1];
    // let removedValue = array.splice(index1, 1)[0];
    let removedValue = array[index1];
    out.push({
      'op': 'delete',
      'path': computeReplaceOrDeleteContext(langAdapter, context, index1),
      'value': removedValue,
      'prettyValue': langAdapter.printAst(removedValue)
    });
    if (indexDiff[2] === ARRAY_MOVE) {
      // reinsert later
      toInsert.push({
        index: indexDiff[1],
        value: removedValue
      });
    }
  }

  // insert items, in reverse order to avoid moving our own floor
  function getPrettyValue(val) {
    // if (langAdapter.getLang() === 'js' && val.type === 'Property') {
    //   // Include just the value of the property, the name will be in the path.
    //   return langAdapter.printAst(val.value);
    // } else {
    return smartTrim(langAdapter.printAst(val));  // 2017-02-24 added .trim b/c of properties
    // }
  }

  toInsert = toInsert.sort(compare.numericallyBy('index'));
  let toInsertLength = toInsert.length;
  for (let index = 0; index < toInsertLength; index++) {
    let insertion = toInsert[index];
    // array.splice(insertion.index, 0, insertion.value);
    // out.push(new CodeChange({'changeType': 'add', 'context': 'xxx', 'content': insertion.value});
    out.push({
      'op': 'add',
      'path': computeAddContext(langAdapter, context, insertion),
      'value': insertion.value,
      'prettyValue': getPrettyValue(insertion.value)
    });
  }

  // apply modifications - none on array right now.
  if (toModify.length > 0) {
    throw new Error('NYI array mods');
  }
}

// This is called when strings differ -- so it's a replace operation.
function collectStringOrTrivialChange(langAdapter, context, result, out) {
  function getPrettyValue(val) {
    if (langAdapter.getLang() === 'js') {

      // Happens if value changed from undefined to null.
      // 2017-04-07: I'll leave this here, but it was happening when recast.visit had side effects.
      // 2017-11-28: Adding back and supporting undefined also.
      if (isNullOrUndefined(context.right)) {  //  context.right === null) {
        return val;

        // Return the raw version, with quotes.
      } else if (context.right.type === 'Literal') {
        let node = context.right.raw;
        assert(node, 'Did not find raw string node');
        return node;

        // Below, comments come as a js array.
      } else if (context.right.type === 'ArrayExpression' || context.right.type === 'ObjectExpression' || isArray(context.right)) {
        let node = context.right;
        return smartTrim(langAdapter.printAst(node/*.elements*/));

      // 2017-11-28: handle expressions like 2*2. Turned out wasn't needed, instead we wrote: collectObjectTypeChange
      // } else if (context.parent.right.type === 'BinaryExpression') {  // context.right === 'BinaryExpression') {
      //   let node = context.parent.right;
      //   return smartTrim(langAdapter.printAst(node));

      } else {
        // Assume it's a string, so go to parent.
        let node = context.parent.right.raw;
        assert(node, 'Did not find raw string node');
        return node;
      }
    } else {
      // return context.childName + '="' + val + '"';  // this was for html only
      return val;
    }
  }

  if (result.length === 1) {
    // An add.
    let newValue = result[0];
    out.push({
      'op': 'add',
      'path': computeStringDiffContext(langAdapter, context),
      'value': langAdapter.makeFakeAstNode(newValue, context),
      'prettyValue': getPrettyValue(newValue)  // This is a value, not ast node.
    });
  } else if (result.length === 2) {
    // A replace.
    let [/*oldValue*/, newValue] = result;
    out.push({
      'op': 'replace',
      'path': computeStringDiffContext(langAdapter, context),
      'value': langAdapter.makeFakeAstNode(newValue, context),
      'prettyValue': getPrettyValue(newValue)  // This is a value, not ast node.
    });
  } else if (result.length === 3 && result[2] === 0) {
    // A delete.
    let oldValue = result[0];
    out.push({
      'op': 'delete',
      'path': computeStringDiffContext(langAdapter, context),
      'value': langAdapter.makeFakeAstNode(oldValue, context),
      'prettyValue': getPrettyValue(oldValue)  // This is a value, not ast node.
    });
  } else {
    throw new Error('Unknown string change type: ' + result);
  }
}


function collectObjectTypeChange(langAdapter, context, result, out) {
  // Only handles changing object type.
  assert(result.length === 2, 'Bad diff to collectObjectTypeChange');

  // A replace.
  let [/*oldValue*/, newValue] = result;
  let prettyNewValue = smartTrim(langAdapter.printAst(newValue));
  out.push({
    'op': 'replace',
    'path': computeStringDiffContext(langAdapter, context),
    'value': langAdapter.makeFakeAstNode(newValue, context),
    'prettyValue': prettyNewValue   // This is a value, not ast node.
  });
}


// Return list of differences between oldAst and newAst.
export function compareAstJs(oldAst, newAst, wantOldTimeDiff?): Array<IJsonPatch> {
  const langAdapter = getLangAdapter('js');
  if (wantOldTimeDiff) {
    window['crsGlobal'] = function () {
    };
    return jsondiffpatchInstanceJs.diff(oldAst, newAst);
  } else {
    let out = [];
    window['crsGlobal'] = function (context, result, caller) {
      if (caller === 'array') {
        collectArrayChanges(langAdapter, context, result, out);
      } else if (caller === 'string' || caller === 'trivial') {
        collectStringOrTrivialChange(langAdapter, context, result, out);
      } else if (caller === 'customObjectPipe') {
        collectObjectTypeChange(langAdapter, context, result, out);
      } else {
        throw new Error('compareAstJs did not recognize: ' + caller);
      }
    };
    jsondiffpatchInstanceJs.diff(oldAst, newAst);
    return out;
  }
}

// TODOoptional You could unify this if you wanted.
export function compareAstHtml(oldAst, newAst): Array<IJsonPatch> {
  const langAdapter = getLangAdapter('html');
  let out = [];
  window['crsGlobal'] = function (context, result, caller) {
    if (caller === 'array') {
      collectArrayChanges(langAdapter, context, result, out);
    } else if (caller === 'string' || caller === 'trivial') {
      collectStringOrTrivialChange(langAdapter, context, result, out);
    } else {
      throw new Error('compareAstHtml did not recognize: ' + caller);
    }
  };
  jsondiffpatchInstanceHtml.diff(oldAst, newAst);
  return out;
}

export function compareAstJson(oldAst, newAst): Array<IJsonPatch> {
  const langAdapter = getLangAdapter('json');
  let out = [];
  window['crsGlobal'] = function (context, result, caller) {
    if (caller === 'array') {
      collectArrayChanges(langAdapter, context, result, out);
    } else if (caller === 'string' || caller === 'trivial') {
      collectStringOrTrivialChange(langAdapter, context, result, out);
    } else {
      throw new Error('compareAstJson did not recognize: ' + caller);
    }
  };
  jsondiffpatchInstanceJson.diff(oldAst, newAst);
  return out;
}

export function applyJsonPatches(langAdapter: LangAdapter, ast, jsonPatches: Array<IJsonPatch>): void {
  // Not sure how to handle patching, so start out separate.
  if (langAdapter.getLang() === 'js') {
    applyJsonPatchesFunJs(langAdapter, ast, jsonPatches);
  } else if (langAdapter.getLang() === 'html') {
    applyJsonPatchesFunHtml(langAdapter, ast, jsonPatches);
  } else if (langAdapter.getLang() === 'json') {
    applyJsonPatchesFunJson(langAdapter, ast, jsonPatches);
  } else {
    throw new Error('Bad language: ' + this.langAdapter.getLang());
  }
}


