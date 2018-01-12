import {IAuthorProject, IAuthorFirstStep, IAuthorStep} from "./author.service";
import {FileSystemContainer, compareFs, filterDeltaNoProjectPlan} from "../project/ast/utils";
import {IGenericProject, IProject, IStep} from "../project/project.service";
import {deepCopy} from "../common/jsutils";


// Return previous and current versions, so that caller can do diffing.
export function calcFSForAuthor(project: IGenericProject, stepNum: number): [FileSystemContainer, FileSystemContainer] {
  // This is the live filesystem.
  // Important: use copy of file system, otherwise you're changing the first step's file system.
  let firstStep: IAuthorFirstStep = <IAuthorFirstStep><any>project.steps[0];
  let fs = new FileSystemContainer(deepCopy(firstStep.file_system));

  // Compute requested steps.
  project.steps.slice(1).forEach((step: IAuthorStep, index: number) => {
    // Apply up through but not including current step.
    if ((index + 1) < stepNum) {
      fs.applyStep(step);
    }
  });

  // Make a separate copy of fs. At the moment, its ast's will be repopulated, easier than cloning ast's, I think.
  let previousFileSystem = deepCopy(fs.fileSystem);
  let prevfs = new FileSystemContainer(previousFileSystem);

  // Now do final step.
  fs.applyStep(project.steps[stepNum]);

  return [prevfs, fs];
}

// Return previous version, so that caller can do diffing.
export function calcFSForPlay(driverProject: IAuthorProject, project: IProject, stepNum: number): FileSystemContainer {
  // This is the live filesystem.
  // Important: use copy of file system, otherwise you're changing the first step's file system.
  let firstStep: IAuthorFirstStep = <IAuthorFirstStep><any>driverProject.steps[0];
  let fs = new FileSystemContainer(deepCopy(firstStep.file_system));

  // Compute requested steps.
  project.steps.forEach((step: IStep, index: number) => {
    // Apply up through but not including current step.
    if ((index + 1) < stepNum) {
      fs.applyStep(step);
    }
  });

  return fs;
}

// Test that patching can support these changes.
export function validatePatchesAreSupported(fs: FileSystemContainer, origFs: FileSystemContainer, step: IAuthorStep): string[] {
  // Apply changes to a copy of fs.
  let tmpFs = new FileSystemContainer(deepCopy(origFs.fileSystem));
  try {
    tmpFs.applyStep(step);
  } catch (e) {
    return ['Got an exception while test applying patch: ' + e];
  }

  // See if any diffs.
  let computedDelta = compareFs(fs, tmpFs);
  if (computedDelta.length > 0) {
    return computedDelta;
  }

  // See if there is a problem with the size of the patches.
  for (let deltaEntry of filterDeltaNoProjectPlan(step.delta)) {
    let count = deltaEntry.diffs.length;
    if (count === 0) {
      return ['No changes found in delta'];
    } else if (count > 2) {
      return ['Too many changes found (' + count + '), we support max 2 per file'];
    }
  }

  // No problems.
  return null;
}

// Validate patches. For each patch: apply it, compute delta, compare the delta to the patch.
export function validateAuthorProjectChanges(authorProject: IAuthorProject) {
  // This is the live filesystem.
  // Important: use copy of file system, otherwise you're changing the first step's file system.
  let firstStep: IAuthorFirstStep = <IAuthorFirstStep><any>authorProject.steps[0];
  let fs = new FileSystemContainer(deepCopy(firstStep.file_system));

  // Compute requested steps.
  authorProject.steps.slice(1).forEach((step: IAuthorStep) => {
    fs.applyAndValidateStep(step);
  });
}
