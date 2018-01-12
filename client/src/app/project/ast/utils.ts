import * as recast from 'recast';
import {applyJsonPatches, cleanCopyDelta, cleanCopyPatches, IJsonPatch} from "./astdiff";
import {IAuthorStep, IDeltaEntry} from "../../author/author.service";
import {EcmascriptAdapter} from "./ecmascript";
import {HtmlAdapter} from "./html/html.desc";
import {IGenericStep, IStep} from "../project.service";
import {JsonAdapter} from "./json/json.lang";
import {deepCopy} from "../../common/jsutils";

declare let CodeMirror: any;
declare let marked: any;  // markdown rendering library: TODO: simplemde also included marked, so it's included twice


// Return list of non-project plan updates.
export function filterDeltaNoProjectPlan(deltaEntries: IDeltaEntry[]): IDeltaEntry[] {
  return deltaEntries.filter(deltaEntry => deltaEntry.filename !== 'db/todo.json');
}

// Either return update on project plan, or null.
export function filterDeltaJustProjectPlan(deltaEntries: IDeltaEntry[]): IDeltaEntry {
  let updates = deltaEntries.filter(deltaEntry => deltaEntry.filename === 'db/todo.json');
  if (updates.length > 0) {
    assert(updates.length === 1, 'Can only have one project plan update');
    return updates[0];
  } else {
    return null;
  }
}


export class FileEntry {
  name: string;
  contents: string;

  constructor(name, contents) {
    this.name = name;
    this.contents = contents;
  }
}

export type FileSystem = Array<FileEntry>;


// These are all really static, but you cannot define static interfaces in typescript.
export interface LangAdapter {
  // Basic AST functions.
  getLang(): string;
  parseAst(value: string): any;
  parsePatchAst(value: string, path: string): any;
  printAst(ast: any): string;
  prettyPrintAst(ast: any): string;  // Same as printAst, but reformat all.
  getFieldNamesOnAstNode(ast: any): string[];

  // Smart auto-prompt.
  getAutoPromptForPatch(patch: IJsonPatch): string;

  // json diff support using jsondiffpatch, the compare function eventually calls the compute context functions.
  // context's are bottom-up stacks of json diff context, they should return in same order, which gets reversed later.
  compareAst(oldAst: any, newAst: any): Array<IJsonPatch>;
  computeAddContext(context): string[];
  computeReplaceDeleteContext(context, replaceDeleteNode): string[];
  computeStringDiffContext(context): string[];
  makeFakeAstNode(stringValue, context): any;

  // Apply patch support.
  copyAstStripLoc(ast: any): any;
  findScopeForAdd(ast: any, scopeList: string[]): any;
  findScopeForReplace(ast: any, scopeList: string[]): [any, number, any];
  getShortAstDesc(obj, contextName?: string, lastContextName?: string, lastNode?: any): string;
}

const langAdapters: { [id: string]: LangAdapter } = {
  'js': new EcmascriptAdapter(),
  'html': new HtmlAdapter(),
  'json': new JsonAdapter(),
};

export function getLangAdapter(lang: string): LangAdapter {
  return langAdapters[lang];
}

function specialCaseAddingAFile(deltaEntry: IDeltaEntry): boolean {
  if (deltaEntry.diffs[0].op === 'add_file') {
    if (deltaEntry.diffs.length > 1) {
      complain('Too many changes found on add_file');
    } else {
      return true;
    }
  } else {
    return false;
  }
}

export function getLangAdapterFromFilename(filenameParam: string): LangAdapter {

  // Hide function here, so no one else can call it.
  function getLangFromFilename(filename: string) {
    if (filename.endsWith('.js')) {
      return 'js';
    } else if (filename.endsWith('.html')) {
      return 'html';
    } else if (filename.endsWith('.json')) {
      return 'json';
    } else {
      throw new Error('Bad suffix in getLangFromFilename: ' + filename);
    }
  }

  return getLangAdapter(getLangFromFilename(filenameParam));
}


export class FileSystemContainer {
  // private _astCache;   2017-05-23: this just caused problems

  constructor(public fileSystem: FileSystem) {
  }

  getFileEntry(filename: string): FileEntry {
    return this.fileSystem.filter(entry => entry.name === filename)[0];  // for ES6 use: .find()
  }

  getAst(filename) {
    let entry = this.getFileEntry(filename);
    if (entry === undefined) {
      // 2017-03-09 added this condition for adding todo.json files.
      return null;
    }
    let contents = entry.contents;
    let langAdapter = getLangAdapterFromFilename(filename);
    return langAdapter.parseAst(contents);
  }

  maybeFindFile(filename) {
    let found: FileEntry[] = this.fileSystem.filter(entry => entry.name === filename);
    if (found.length > 0) {
      return found[0].contents;
    } else {
      // Not found.
      return null;
    }
  }

  addFileEntry(filename, contents) {
    // Sanity check.
    if (this.maybeFindFile(filename)) {
      complain('Problem: ' + filename + ' already exists.');
    }
    let fileEntry: FileEntry = {name: filename, contents: contents};
    this.fileSystem.push(fileEntry);
  }

  // Apply given delta in step, and update both the cached ASTs and the files in the file system.
  _applyAndValidateStep(step: IGenericStep, validate: boolean): void {
    step.delta.forEach((deltaEntry: IDeltaEntry) => {
      this.applyDeltaEntryFromStep(deltaEntry, validate);
    });
  }

  public applyDeltaEntryFromStep(deltaEntry: IDeltaEntry, validate: boolean) {
    const langAdapter = getLangAdapterFromFilename(deltaEntry.filename);

    // Add empty file if necessary.
    if (specialCaseAddingAFile(deltaEntry)) {
      if (langAdapter.getLang() === 'json') {
        this.addFileEntry(deltaEntry.filename, []);
      } else {
        complain('Unhandled language: ' + langAdapter.getLang());
      }
    }

    // Update cached AST.
    let ast = this.getAst(deltaEntry.filename);
    let origAst;
    if (validate) {
      origAst = deepCopy(ast);
    }
    applyJsonPatches(langAdapter, ast, deltaEntry.diffs);

    // Update file.
    let fileEntry = this.getFileEntry(deltaEntry.filename);
    fileEntry.contents = langAdapter.printAst(ast);

    // Validate change.
    if (validate) {
      let computedPatches = langAdapter.compareAst(origAst, ast);
      assertDeepEqualIgnoreWhiteSpace(cleanCopyPatches(deltaEntry.diffs), cleanCopyPatches(computedPatches));
    }
  }

  applyStep(step: IGenericStep): void {
    this._applyAndValidateStep(step, false);
  }

  applyAndValidateStep(step: IGenericStep): void {
    this._applyAndValidateStep(step, true);
  }
}


// Return list of diffs. Really rough right now.
export function compareFs(origFs: FileSystemContainer, tmpFs: FileSystemContainer): string[] {
  let out: string[] = [];
  if (origFs.fileSystem.length === tmpFs.fileSystem.length) {
    // Good, same length.
    origFs.fileSystem.forEach((origEntry: FileEntry, index: number) => {
      let tmpEntry = tmpFs.fileSystem[index];
      if (origEntry.name !== tmpEntry.name) {
        out.push('Name mismatch, skipping content check');
      } else {
        // Names match, check content.
        const filename = origEntry.name;
        const langAdapter = getLangAdapterFromFilename(filename);

        let patches = langAdapter.compareAst(origFs.getAst(filename), tmpFs.getAst(filename));
        if (patches.length > 0) {
          console.log('compareFs content mismatch', patches);
          out.push('Content mismatch');
        }
      }
    });
  } else {
    out.push('Different number of files');
  }
  return out;
}


export class StepAdapter {

  static findEntry(step, filename): IDeltaEntry {
    for (let index = 0; index < step.delta.length; index++) {
      let entry = step.delta[index];
      if (entry.filename === filename) {
        // Found!
        return entry;
      }
    }
    // Not found.
    return null;
  }

  private static findEntryIndex(step, filename): number {
    for (let index = 0; index < step.delta.length; index++) {
      let entry = step.delta[index];
      if (entry.filename === filename) {
        // Found!
        return index;
      }
    }
    // Not found.
    return -1;
  }

  /* Add or update IDeltaEntry, and return it. */
  private static addEntry(step: IGenericStep, filename, patches): IDeltaEntry {
    let entry = this.findEntry(step, filename);
    if (entry) {
      // Update existing.
      entry.diffs = patches;
      return entry;
    } else {
      // Add new.
      let newEntry: IDeltaEntry = {filename: filename, diffs: patches};
      step.delta.push(newEntry);
      return newEntry;
    }
  }

  private static removeEntry(step: IGenericStep, filename) {
    let index = this.findEntryIndex(step, filename);
    if (index >= 0) {
      step.delta.splice(index, 1);
    }
  }

  private static clearDelta(step: IGenericStep) {
    step.delta = [];
  }

  // Take event, figure out change against prevfs, and store in step.
  public static updateDelta(step: IGenericStep, prevfs, event: FileSystemEditEvent) {
    let filename = event.fileEntry.name;
    let previousAst = prevfs.getAst(filename);
    const langAdapter = getLangAdapterFromFilename(filename);
    let patches = langAdapter.compareAst(previousAst, event.newAst);

    // Update delta.
    if (patches.length > 0) {
      // Add/update
      this.addEntry(step, filename, patches);
    } else {
      // Remove.
      this.removeEntry(step, filename);
    }
  }

  // Copy file system fs on top of step's file system.
  // Make sure to make a deep copy to make them independent copies.
  static copyFileSystemAndClearDelta(prevfs: FileSystemContainer, fs: FileSystemContainer, step: IStep): void {

    // To copy it, mutate the array with splice. Don't do "fs.fileSystem =", because then FileSystemContainer
    // references are broken.
    replaceElementsOfArrayByMutation(fs.fileSystem, deepCopy(prevfs.fileSystem));

    // Clear out deltas.
    this.clearDelta(step);
  }

  // Copy driverStep to step.
  static copyDelta(driverStep: IAuthorStep, step: IStep) {
    step.delta = cleanCopyDelta(driverStep.delta);
  }

  // Like copyDelta, but only copy project plan part.
  static copyDeltaJustProjectPlanPart(driverStep: IAuthorStep, step: IStep, file_system: FileSystem) {
    let driverProjectUpdate: IDeltaEntry = filterDeltaJustProjectPlan(driverStep.delta);
    if (driverProjectUpdate) {
      // See if user did it already.
      let userProjectUpdate: IDeltaEntry = filterDeltaJustProjectPlan(step.delta);
      if (!userProjectUpdate) {
        // Not done yet, copy it.
        let newUserEntry: IDeltaEntry = this.addEntry(step, driverProjectUpdate.filename, cleanCopyPatches(driverProjectUpdate.diffs));
        let fs = new FileSystemContainer(file_system);
        fs.applyDeltaEntryFromStep(newUserEntry, /*validate=*/false);
      }
    }
  }

  static isOnlyProjectPlanUpdateStep(driverStep: IAuthorStep) {
    let delta = driverStep.delta;
    return (delta.length === 1 && delta[0].filename === 'db/todo.json');
  }

  //noinspection JSUnusedGlobalSymbols
  static hasAnyProjectUpdate(driverStep: IAuthorStep): boolean {
    let delta = driverStep.delta;
    let matches = delta.filter(deltaEntry => deltaEntry.filename === 'db/todo.json');
    return matches.length > 0;
  }

  static findProjectPlanDeltaEntry(driverStep: IAuthorStep): IDeltaEntry {
    let delta = driverStep.delta;
    let matches = delta.filter(deltaEntry => deltaEntry.filename === 'db/todo.json');
    if (matches.length === 1) {
      return matches[0];
    } else {
      // Not present. Happens when you create a new step at the beginning.
      return null;
    }
  }
}


export class FileSystemEditEvent {
  constructor(public fileEntry: FileEntry, public newAst) {
  }
}


// Helper functions for FileSystem. Can't make it a class, b/c subclassing Array is tricky.
export function FileSystemFindFile(search: FileSystem, file_name: string): FileEntry {
  return search.filter(entry => entry.name === file_name)[0];  // for ES6 use: .find()
}

export function getFileTypeFromNameCodeMirror(fileName: string): string {
  let m, mode, spec;
  if (m = /.+\.([^.]+)$/.exec(fileName)) {
    let info = CodeMirror.findModeByExtension(m[1]);
    if (info) {
      mode = info.mode;
      spec = info.mime;
    }
  } else if (/\//.test(fileName)) {
    let info = CodeMirror.findModeByMIME(fileName); // crs: I just copied this, not sure purpose.
    if (info) {
      mode = info.mode;
      spec = fileName;
    }
  } else {
    mode = spec = fileName;
  }
  if (mode) {
    return spec;
  } else {
    alert("Could not find a mode corresponding to " + fileName);
  }
}

export function complain(val, quiet?: boolean) {
  console.log('PROBLEM FOUND:\n\n', val);
  if (!quiet) {
    alert(val);
  }
  throw val;
}

// Poor man's assert.
export function assert(condition, message) {
  if (!condition) {
    complain(message);
  }
}

export function assertDeepEqual(one, two) {
  if (!deepEqual(one, two)) {
    let oneStr = JSON.stringify(one, null, 2);
    let twoStr = JSON.stringify(two, null, 2);
    console.log('assertDeepEqual.1', one, oneStr);
    console.log('assertDeepEqual.2', two, twoStr);
    complain('Mismatch in structures, see console.log for details');
  }
}

export function assertDeepEqualIgnoreWhiteSpace(one, two) {
  if (!deepEqual(one, two, /*ignoreWhiteSpace=*/true)) {
    let oneStr = JSON.stringify(one, null, 2);
    let twoStr = JSON.stringify(two, null, 2);
    console.log('assertDeepEqualIgnoreWhiteSpace.1', one, oneStr);
    console.log('assertDeepEqualIgnoreWhiteSpace.2', two, twoStr);
    complain('Mismatch in structures, see console.log for details');
  }
}

// Taken from: http://stackoverflow.com/questions/38400594/javascript-deep-comparison
export function deepEqual(a, b, ignoreWhiteSpace?: boolean) {
  if ((typeof a === 'object' && a != null) && (typeof b === 'object' && b != null)) {
    let count = [0, 0];
    //noinspection JSUnusedLocalSymbols,TsLint
    for (let key in a) count[0]++;
    //noinspection JSUnusedLocalSymbols,TsLint
    for (let key in b) count[1]++;
    if (count[0] - count[1] !== 0) {
      return false;
    }
    for (let key in a) {
      //noinspection JSUnfilteredForInLoop
      if (!(key in b) || !deepEqual(a[key], b[key], ignoreWhiteSpace)) {
        return false;
      }
    }
    for (let key in b) {
      //noinspection JSUnfilteredForInLoop
      if (!(key in a) || !deepEqual(b[key], a[key], ignoreWhiteSpace)) {
        return false;
      }
    }
    return true;
  } else {
    if (ignoreWhiteSpace && typeof a === 'string' && typeof b === 'string') {
      return noWhiteSpace(a) === noWhiteSpace(b);
    } else {
      return a === b;
    }
  }
}

export function deepEqualIgnoreWhiteSpace(one, two): boolean {
  return deepEqual(one, two, true);
}

export function smartSplit(val: string, delim: string): Array<string> {
  if (!val) {
    return [];  // bummer this isn't the default split() behavior
  } else {
    // Return list, filtering out empty strings.
    return val.split(delim).filter(item => item.length > 0);
  }
}

export function prettyPrintAstJs(ast): string {
  return recast.prettyPrint(ast, {tabWidth: 2}).code;
}

// Keep user's original formatting.
export function printAstJs(ast: any): string {
  if (Array.isArray(ast)) {
    // Special case of comments.
    let out = [];
    ast.forEach(item => {
      if (item.type === 'Line') {
        out.push('//' + item.value);
      } else if (item.type === 'Block') {
        out.push('/*' + item.value + '*/');
      } else {
        complain('Unknown comment type: ' + item.type, true);
      }
    });
    return out.join('\n');
  } else {
    return recast.print(ast, {tabWidth: 2}).code;
  }
}

//noinspection JSUnusedGlobalSymbols
export function arraysEqualAnyOrder(a, b) {
  return a.length === b.length && a.every(el => b.includes(el));
}



// Next few lines came from Dexie.js
let _global = window;
// typeof self !== 'undefined' ? self :
//   typeof window !== 'undefined' ? window :
//     global;

export const concat = [].concat;
function flatten(a) {
  return concat.apply([], a);
}

// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
// crs added Number
export let intrinsicTypes =
  "Boolean,String,Date,RegExp,Blob,File,FileList,ArrayBuffer,DataView,Uint8ClampedArray,ImageData,Map,Set,Number"
    .split(',').concat(
    flatten([8, 16, 32, 64].map(num => ["Int", "Uint", "Float"].map(t => t + num + "Array")))
  ).filter(t => _global[t]).map(t => _global[t]);

// Comes from: http://stackoverflow.com/questions/5515310/is-there-a-standard-function-to-check-for-null-undefined-or-blank-variables-in
// This is clever, and handles: undefined, null, [], ''.
// export function isEmpty(value){
//   return (value == null || value.length === 0);
// }

// This is like isEmpty but also handles boolean.
export function isEmptyOrFalse(value) {
  return (value == null || value.length === 0 || value === false);
}

export function isNullOrUndefined(value) {
  return (value === undefined || value === null);
}


// Make a custom markdown renderer for marked library to make all links open in new tab.
// Others have requested this as an option, but it hasn't been accepted yet.
// This code is taken from marked's Renderer.prototype.link
let renderer = new marked.Renderer();
renderer.link = function (href, title, text) {
  // Below, only change by crs is adding "target".
  let out = '<a target="_blank" href="' + href + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  out += '>' + text + '</a>';
  return out;
};

export function renderMarkdownAsHtml(text) {
  return marked(text, {renderer: renderer});
}

//noinspection JSUnusedGlobalSymbols
export function noWhiteSpace(s) {
  return s.replace(/\s/g, '');
}

export function countLines(s) {
  return s.split('\n').length;
}


// Return complete list of nodes, bottom first, from jsondiffpatch context.
export function makeStackFromDiffContextRight(context) {
  let fullStack = [];
  let tempContext = context;
  while (tempContext) {
    let node = tempContext.right;  // Additions come from right, not left.
    fullStack.push(node);
    tempContext = tempContext.parent;
  }
  return fullStack;
}

// Return complete list of nodes, bottom first, from jsondiffpatch context.
export function makeStackFromDiffContextLeft(context) {
  let fullStack = [];
  let tempContext = context;
  while (tempContext) {
    let node = tempContext.left;  // Replaces/deletes come from left, not right.
    fullStack.push(node);
    tempContext = tempContext.parent;
  }
  return fullStack;
}

// For the "json" language, we're storing the json structure in patches and the database.
// So, to avoid nasty bugs, call deepCopy below whenever other code would have made a separate AST or string.
export function makeJsonLangSafeByCopying(value) {
  return deepCopy(value);
}

function replaceElementsOfArrayByMutation(arrayToChange, arrayWithElementsToCopy) {
  arrayToChange.splice(0, arrayToChange.length, ...arrayWithElementsToCopy);
}
