// Help with detecting types.
import {firstArrayContainedInSecond} from "./jsutils";
import {IDeltaEntry} from "../author/author.service";


export function isArray(obj): boolean {
  return Array.isArray(obj);
}

export function isNumber(value): boolean {
  // return !isNaN(Number(value));
  return typeof value === 'number';
}

//noinspection JSUnusedGlobalSymbols
export function isStringNumber(value): boolean {
  return !isNaN(Number(value));
}

export function isString(value): boolean {
  return typeof value === 'string';
}

function isStringArray(value): boolean {
  if (isArray(value)) {
    // Now check first entry.
    if (value.length > 0) {
      const first = value[0];
      return isString(first);
    } else {
      // Empty array.
      return true;
    }
  } else {
    return false;
  }
}

function isFileSystem(value): boolean {
  if (isArray(value)) {
    for (let entry of value) {
      // Just two fields to validate: name + contents.
      if (!isString(entry.name) || !isString(entry.contents)) {
        return false;
      }
      let problem = ensureNoExtraFields(entry, ['name', 'contents']);
      if (problem) {
        return false;
      }
    }

    // All done, no problems.
    return true;
  } else {
    return false;
  }
}

// Return useful message about validation problem, or '' if no problem.
function validateDeltaEntryArray(value): string {
  let problem: string;
  for (let deltaEntry of value) {
    if (problem = validateField(deltaEntry, 'filename', 'string')) return problem;
    if (problem = validateField(deltaEntry, 'diffs', 'IJsonPatch[]')) return problem;
    if (problem = ensureNoExtraFields(deltaEntry, ['filename', 'diffs'])) return problem;
  }

  // No problem.
  return '';
}

function validateJsonPatch(deltaEntry: IDeltaEntry, value): string {
  let filename = deltaEntry.filename;
  let problem: string;
  for (let jsonPatch of value) {
    if (problem = validateField(jsonPatch, 'op', 'string')) return problem;
    if (problem = validateField(jsonPatch, 'path', 'string')) return problem;
    if (filename.endsWith('.json')) {
      // Sorry, nothing to validate. Can be string, object or array.
      // if (problem = validateField(jsonPatch, 'prettyValue', 'array')) return problem;
    } else {
      if (problem = validateField(jsonPatch, 'prettyValue', 'string')) return problem;
    }
    if (problem = ensureNoExtraFields(jsonPatch, ['op', 'path', 'prettyValue'])) return problem;
  }

  // No problem.
  return '';
}

export function ensureNoExtraFields(obj: any, allowedFields: string[]): string {
  let keys = Object.keys(obj);
  if (firstArrayContainedInSecond(keys, allowedFields)) {
    // Good, equal.
    return '';
  } else {
    return 'Extra fields found: ' + keys + ' are not in: ' + allowedFields;
  }
}

// New. Above is old.
export function validateField(obj: any, fieldName: string, fieldType: string, isOptional?: boolean): string {
  const value = obj[fieldName];
  if (value === undefined) {
    // Field missing, might be a problem.
    if (isOptional) {
      return '';
    } else {
      return 'Missing required field ' + fieldName;
    }
  } else {
    // Validate type.
    switch (fieldType) {
      case 'number':
        return isNumber(value) ? '' : 'Expected a number in field ' + fieldName;
      case 'string':
        return isString(value) ? '' : 'Expected a string in field ' + fieldName;
      case 'string[]':
        return isStringArray(value) ? '' : 'Expected a string array in field ' + fieldName;
      case 'file_system':
        return isFileSystem(value) ? '' : 'Expected a file system in field ' + fieldName;
      case 'DeltaEntry[]':
        return validateDeltaEntryArray(value);
      case 'IJsonPatch[]':
        return validateJsonPatch(obj, value);
      case 'array':  // Generic array.
        return isArray(value) ? '' : 'Expected an array in field ' + fieldName;
      default:
        return 'Cannot handle fieldType: ' + fieldType;
    }
  }
}
