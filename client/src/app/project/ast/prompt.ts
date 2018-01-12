import {getLangAdapterFromFilename, StepAdapter, LangAdapter} from "./utils";
import {IJsonPatch, getAstOnPatch} from "./astdiff";
import {findFirstDiff, IWrongChange, SimpleProblem} from "./astcmp";
import {IDeltaEntry, IAuthorStep} from "../../author/author.service";
import {IStep} from "../project.service";
import {pathHasHtmlAttribs, attribNameFromPath} from "./html/html.desc";


// Return list of prompts/hints for given delta, used in both author + play.
export function getAutoPromptForDelta(delta: IDeltaEntry[]): string[] {
  let out = [];
  // Handle if called by angular before data is loaded.
  if (!delta || delta.length === 0) {
    out.push('There are no changes.');
  } else {
    // Accumulate and return as a list.
    delta.forEach((deltaEntry: IDeltaEntry) => {
      let langAdapter = getLangAdapterFromFilename(deltaEntry.filename);
      if (deltaEntry.filename === 'db/todo.json') {
        // No prompt.
      } else {
        deltaEntry.diffs.forEach(patch => {
          out.push(langAdapter.getAutoPromptForPatch(patch));
        });
      }
    });
  }
  return out;
}

export function giveFeedbackOnJshintErrors(errors) {
  // Count the errors
  let count = {};
  errors.forEach(error => {
    let line = +error.from.line;
    count[line] = !count[line] ? 1 : count[line] + 1;
  });

  // Convert to list.
  let countList = [];
  for (let keyString in count) {
    let key = +keyString;
    let value = count[key];
    countList.push([key, value]);
  }

  // Sort the list.
  countList.sort(function (a, b) {
    return a[0] - b[0];  // First entry is line number.
  });

  // Output summary.
  let out = [];
  out.push("<p>You've got syntax issues to fix before I can check what you're doing:</p>");
  out.push('<ul>');
  countList.forEach(countItem => {
    let [line, count] = countItem;
    out.push("<li>Line " + (line + 1) + " (" + count + " problems)</li>");
  });
  out.push('</ul>');
  return out.join('\n');
}

export function summarizeJshintCodingErrors(errors): string[] {
  let out: string[] = [];
  errors.forEach(error => {
    let line = +error.from.line;
    out.push('Line ' + (line+1) + ': ' + error.message);
  });
  return out;
}

export function summarizeEsprimaCodingErrors(errors): string[] {
  let out: string[] = [];
  errors.forEach(error => {
    let line = +error.lineNumber;
    out.push('Line ' + (line) + ': ' + error.description);
  });
  return out;
}

function matchAstChange(langAdapter: LangAdapter, expectPatch: IJsonPatch, newPatch: IJsonPatch): IWrongChange {
  if (expectPatch.op !== newPatch.op) {
    return new SimpleProblem('Expected an ' + expectPatch.op + ' but instead found an ' + newPatch.op);
  }
  if (expectPatch.path !== newPatch.path) {
    if (langAdapter.getLang() === 'html' && pathHasHtmlAttribs(expectPatch.path)) {
      // We expected an attribute change.
      let expectAttribName = attribNameFromPath(expectPatch.path);
      let newAttribName = attribNameFromPath(newPatch.path);
      if (!newAttribName) {
        return new SimpleProblem('You were supposed to ' + expectPatch.op + ' an attribute.');
      } else if (newAttribName !== expectAttribName) {
        return new SimpleProblem('You entered the wrong attribute name.');
      } else {
        return new SimpleProblem('You added the attribute to the wrong location.');
      }
    } else {
      return new SimpleProblem('You wrote the code in the wrong location.');
    }
  }

  // Compare ASTs.
  return findFirstDiff(langAdapter, getAstOnPatch(langAdapter, expectPatch), getAstOnPatch(langAdapter, newPatch)); // newPatch.value); changed 3/24/2017 to handle json changes
}

// Return problem, or empty string if all good.
function giveFeedbackOnPatchesInOneFile(langAdapter: LangAdapter, expectPatches: IJsonPatch[], newPatches: IJsonPatch[]): IWrongChange {
  if (expectPatches.length === 0) {
    // No changes, so no feedback.
    return new SimpleProblem('');
  } else if (expectPatches.length === 1) {
    if (!newPatches || newPatches.length === 0) {
      return new SimpleProblem('Waiting for anything...');
    } else if (newPatches.length === 1) {
      return matchAstChange(langAdapter, expectPatches[0], newPatches[0]);
    } else {
      return new SimpleProblem('Too many changes: ' + newPatches.length);
    }
  } else if (expectPatches.length === 2) {
    if (newPatches.length === 0) {
      return new SimpleProblem('Waiting for change');
    } else if (newPatches.length === 1) {
      let first = matchAstChange(langAdapter, expectPatches[0], newPatches[0]);
      if (first) {
        return first;
      } else {
        return new SimpleProblem('One statement done, one to go.');
      }
    } else if (newPatches.length === 2) {
      let first = matchAstChange(langAdapter, expectPatches[0], newPatches[0]);
      if (!first) {
        // Good, do second.
        return matchAstChange(langAdapter, expectPatches[1], newPatches[1]);
      } else {
        // First is a problem.
        return first;
      }
    } else {
      return new SimpleProblem("You've made " + newPatches.length + " changes, but I only expected " + expectPatches.length);
    }
  } else {
    return new SimpleProblem('TODO: handle # of changes: ' + expectPatches.length);
  }
}

export function giveFeedbackOnDelta(driverStep: IAuthorStep, userStep: IStep): IWrongChange {

  // 1. Check what they did.
  for (let userDeltaEntry of userStep.delta) {
    let filename = userDeltaEntry.filename;
    let driverDeltaEntry: IDeltaEntry = StepAdapter.findEntry(driverStep, filename);
    if (driverDeltaEntry) {
      let langAdapter = getLangAdapterFromFilename(filename);
      let wrongChange: IWrongChange = giveFeedbackOnPatchesInOneFile(langAdapter, driverDeltaEntry.diffs, userDeltaEntry.diffs);
      if (wrongChange) {
        return wrongChange;
      }
    } else {
      return new SimpleProblem('I did not expect any change to file ' + filename);
    }
  }

  // 2. Check what they didn't do.  TODO: doesn't this overlap/duplicate with above, since user steps overlap driver steps?
  for (let driverDeltaEntry of driverStep.delta) {
    let filename = driverDeltaEntry.filename;
    if (filename === 'db/todo.json') {
      continue;
    }
    let userDeltaEntry: IDeltaEntry = StepAdapter.findEntry(userStep, filename);
    let langAdapter = getLangAdapterFromFilename(filename);
    if (userDeltaEntry) {
      let wrongChange: IWrongChange = giveFeedbackOnPatchesInOneFile(langAdapter, driverDeltaEntry.diffs, userDeltaEntry.diffs);
      if (wrongChange) {
        return wrongChange;
      }
    } else {
      // No changes at the moment.
      return new SimpleProblem('You did not yet make any changes to file ' + filename);
    }
  }

  // Everything is perfect.
  return null;
}

