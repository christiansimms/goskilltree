import {Component, ElementRef, OnInit, Pipe, PipeTransform, ViewChild} from '@angular/core';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {environment} from '../../../environments/environment';
import {ProjectService, IProject, IStep} from "../project.service";
import {
  renderMarkdownAsHtml, FileSystemEditEvent, StepAdapter,
  FileSystemContainer, filterDeltaNoProjectPlan, FileEntry
} from "../ast/utils";
import {cleanCopyDelta} from "../ast/astdiff";
import {
  giveFeedbackOnJshintErrors, getAutoPromptForDelta, giveFeedbackOnDelta, summarizeJshintCodingErrors,
  summarizeEsprimaCodingErrors
} from "../ast/prompt";
import {CMFileEditorComponent, filterFilesNoProjectPlan} from "../cmfile-editor/cmfile-editor.component";
import {packageJshintEvent} from "../event-page/event-page.component";
import {EventService} from "../event.service";
import {clearIframe, injectIframe} from "../ast/sandbox";
import {AuthorService, IAuthorProject, IAuthorStep, IDeltaEntry} from "../../author/author.service";
import {IWrongChange} from "../ast/astcmp";
import {PlayPlanMgr} from "../project-plan";
import {Subject} from "rxjs/Subject";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {calcFSForPlay} from "../../author/author-calc";
import {PlayService} from "../play.service";
// import {PlayMicroManager} from "../play-micro-manager";


@Pipe({
  name: 'noProjectPlanStep'
})
export class NoProjectPlanStep implements PipeTransform {
  transform(deltaEntries: Array<any>): Array<any> {
    if (!deltaEntries) {
      return deltaEntries;  // If data not yet defined, don't crap out.
    }

    return filterDeltaNoProjectPlan(deltaEntries);
  }
}


enum EditContext {
  UserTyped,
  TypeForMe,
  UpdateProjectPlan
}


@Component({
  selector: 'app-play-step-page',
  templateUrl: './play-step-page.component.html',
  styles: []
})
export class PlayStepPageComponent implements OnInit {
  @ViewChild('iframe') iframe: ElementRef;
  @ViewChild('fileEditor') fileEditor: CMFileEditorComponent;

  // Current project.
  project: IProject;
  stepNum: number;
  fs: FileSystemContainer;  // The current step's file system.
  prevfs: FileSystemContainer;  // The previous step's file system.
  step: IStep;

  // Driver project.
  driverProject: IAuthorProject;
  driverStep: IAuthorStep;
  driverDelta: IDeltaEntry[];
  isLastStepInAuthorProject: boolean = false;
  playPlanMgr: PlayPlanMgr;
  // playMicroManager: PlayMicroManager;
  driverStepDescriptionAsHtml: Subject<string> = new BehaviorSubject('');

  //noinspection JSUnusedGlobalSymbols
  showTodoHierarchy: boolean = false;  // TODOfuture: remove? not used ATM
  //noinspection JSUnusedGlobalSymbols
  showFileEditor: boolean = true;
  //noinspection JSUnusedGlobalSymbols
  showCodePreview: boolean = true;
  showReference: boolean = false;
  private debugJsonDelta: Subject<string> = new BehaviorSubject('');

  autoPromptList: string[];
  feedback: string;
  showLintErrors: boolean = false;
  codingErrors: string[] = [];
  canAdvance: boolean = false;
  isLatestStep: boolean = false;
  lastMarker: any;
  //noinspection JSUnusedGlobalSymbols
  environment = environment;
  messAroundMode: boolean = false;
  programIsRunning: boolean = false;

  constructor(private route: ActivatedRoute, private projectService: ProjectService, private authorService: AuthorService, private eventService: EventService, private router: Router, public playService: PlayService) {
  }

  //noinspection JSUnusedGlobalSymbols
  ngOnInit() {
    this.route.params.subscribe((params: Params) => {
      let projectId = +params['projectId'];
      this.stepNum = +params['stepNum'];  // 2017-12-13: now we can. OLD: can't do this, now that we only use project.latest_file_system

      // Load current project and step.
      this.projectService.loadProject(projectId).then(project => {

        // Load driver project and step.
        this.authorService.loadProject(project.driver_id).then(driverProject => {

          // Remember stuff about author/driver project.
          this.playService.useProject(project, this.stepNum);
          this.project = project;
          this.driverProject = driverProject;
          if (this.stepNum > project.total_steps) {
            this.driverStep = {description: 'You are done now, but feel free to play around.', delta: []};
            this.messAroundMode = true;
          } else {
            this.driverStep = this.driverProject.steps[this.stepNum];
            this.messAroundMode = false;
          }

          // Figure out step.
          // this.stepNum = +project.current_step;  REALLY OLD WAY
          // this.stepNum = project.steps.length;   OLDER WAY
          this.step = this.project.steps[this.stepNum - 1];

          // Grab the current file system.
          this.isLatestStep = this.playService.isLatestStep();
          if (this.isLatestStep) {
            this.fs = new FileSystemContainer(this.project.latest_file_system);  // 2017-04-03: added for to-do support.
          } else {
            // Compute a readonly filesystem of this step. Below function calculates previous step, so add + 1.
            this.fs = calcFSForPlay(this.driverProject, this.project, this.stepNum + 1);
          }

          // Grab the previous file system, by calculating it.
          this.prevfs = calcFSForPlay(this.driverProject, this.project, this.stepNum);

          // Reset everything else.
          this.canAdvance = false;
          this.isLastStepInAuthorProject = this.stepNum === this.driverProject.steps.length - 1;
          this.playPlanMgr = new PlayPlanMgr(this.driverStep, this.prevfs);
          clearIframe(this.iframe);  // Don't want to see a previous version of app running.
          this.programIsRunning = false;
          // this.playMicroManager = new PlayMicroManager(this.driverStep, this.fs);

          this.driverStepDescriptionAsHtml.next(renderMarkdownAsHtml(this.driverStep.description));
          this.driverDelta = this.driverStep.delta;
          this.resetFeedback();
          this.autoPromptList = getAutoPromptForDelta(this.driverDelta);
        });
      });
    });
  }

  resetFeedback() {
    this.debugJsonDelta.next('');
    this.feedback = '';  // Clear out previous step's value.
    this.showLintErrors = false;  // Clear out previous step's value.
    this.codingErrors = [];
  }

  doSaveAndPreview() {
    // this.eventService.recordEvent('save-and-preview', this.project.id, this.step);  now that this is auto, don't save it
    this.projectService.saveProject(this.project, this.canAdvance).then(() => {
      this.runThisStep();
    });
  }

  runThisStep() {
    this.programIsRunning = true;
    injectIframe(this.iframe, this.fs.fileSystem);
  }

  // Refresh editor from file system and display the first file in the given step.
  refreshEditorFromFileSystem(step) {
    if (!this.messAroundMode) {
      let deltaEntry = filterDeltaNoProjectPlan(step.delta)[0];
      this.fileEditor.refreshFromFileSystem(deltaEntry.filename);
    } else {
      // There is no driverStep in messAroundMode, so just use last non-project plan file in list.
      let files: FileEntry[] = filterFilesNoProjectPlan(this.fs.fileSystem);
      let lastEntry: FileEntry = files[files.length - 1];
      this.fileEditor.refreshFromFileSystem(lastEntry.name);
    }
  }

  // Called in 2 contexts:
  //   1. Type For Me
  //   2. Update Project Plan
  //noinspection JSUnusedGlobalSymbols
  doTypeForMe(isTypeForMe: boolean) {

    // Reset filesystem to the previous step.
    if (isTypeForMe) {
      this.eventService.recordEvent('help-type-for-me', this.project.id, null);
    } else {
      this.eventService.recordEvent('update-todo-plan', this.project.id, null);
    }
    StepAdapter.copyFileSystemAndClearDelta(this.prevfs, this.fs, this.step);
    this.resetFeedback();

    // Copy over deltas. Otherwise giveFeedbackOnDelta() will not know we are done.
    StepAdapter.copyDelta(this.driverStep, this.step);

    // Apply patches.
    this.fs.applyStep(this.step); // this.driverStep);

    // Refresh the editor component, to show the changes to the user.
    // Project plan updates do not have any changes displayed, so cannot refresh editor since db/todo.json
    // is not a displayed filename.
    if (isTypeForMe) {
      this.refreshEditorFromFileSystem(this.step);
    }

    // Tell user we are done this step.
    this.evalCodeChanges(isTypeForMe ? EditContext.TypeForMe : EditContext.UpdateProjectPlan);
  }

  //noinspection JSUnusedGlobalSymbols
  doResetThisStep() {
    if (confirm('Are you sure you want to lose your changes on this step?')) {
      this.eventService.recordEvent('reset-step', this.project.id, null);
      StepAdapter.copyFileSystemAndClearDelta(this.prevfs, this.fs, this.step);
      this.resetFeedback();
      this.refreshEditorFromFileSystem(this.driverStep);
    }
  }

  //noinspection JSUnusedGlobalSymbols
  advance() {
    this.projectService.makeNextStep(this.project).then(() => {
      let newStepNum = this.stepNum + 1;
      this.eventService.recordEvent('advance-step', this.project.id, newStepNum);
      return this.router.navigate(['/play/' + this.project.id + '/step/' + newStepNum]);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  doGoHome() {
    //noinspection JSIgnoredPromiseFromCall
    this.router.navigate(['/']);
  }

  // Assuming project is updated, go to its last page.
  // noinspection JSUnusedGlobalSymbols
  doReviewDoneProject() {
    let stepNum = this.project.steps.length;
    //noinspection JSIgnoredPromiseFromCall
    this.router.navigate(['/play/' + this.project.id + '/step/' + stepNum]);
  }

  //noinspection JSUnusedGlobalSymbols
  checkMyWork() {
    this.showLintErrors = true;
  }

  // Cursor moved.
  // noinspection JSUnusedGlobalSymbols
  cursorActivityEventCB(event) {
  //   let feedback = this.playMicroManager.handleCursorActivity(event);
  //   if (feedback) {
  //     this.feedback = feedback;
  //   }
  }

  // User made change -- keep it?
  // noinspection JSUnusedGlobalSymbols,JSMethodCanBeStatic
  beforeChangeEventCB(event) {
    // Don't allow editing on older steps.
    if (! this.isLatestStep) {
      // console.log('BLOCKING THIS');
      event.cancel();
    }
  //   let feedback = this.playMicroManager.handleBeforeChange(event);
  //   if (feedback) {
  //     this.feedback = feedback;
  //   }
  }

  //noinspection JSUnusedGlobalSymbols
  astWasChanged(event: FileSystemEditEvent) {
    try {
      let newAst = event.newAst;
      // console.log('DEBUG.astWasChanged', newAst);
      this.canAdvance = false;
      this.codingErrors = [];  // Assume no problem.

      if (!this.driverDelta) {
        // Code editor was loaded before our data was loaded. Just wait.
        this.feedback = 'TODO - AST came before data loaded';

      } else if (newAst.errors) {
        // There are JSHINT errors.
        if (this.showLintErrors) {
          this.feedback = giveFeedbackOnJshintErrors(newAst.errors);
        } else {
          this.feedback = 'Letting you get stuff done...';
        }
        let currentFileStr = event.fileEntry.contents;
        this.codingErrors = summarizeJshintCodingErrors(newAst.errors);
        this.eventService.recordEvent('jshint', this.project.id, packageJshintEvent(newAst.errors, currentFileStr));

      } else if (newAst.program && newAst.program.errors.length > 0) {  // TODOfuture this is only javascript
        // There are esprima parse errors, like an octal number in strict mode.
        let err1 = newAst.program.errors[0];  // TODOfuture: handle multiple simultaneous errors?
        this.feedback = 'Parse error on line ' + err1.lineNumber + ': ' + err1.description;
        this.codingErrors = summarizeEsprimaCodingErrors(newAst.program.errors);
        this.eventService.recordEvent('parse-error', this.project.id, this.feedback);

      } else {
        // No JSHINT errors, let's check the delta for correctness.
        StepAdapter.updateDelta(this.step, this.prevfs, event);
        this.debugJsonDelta.next(JSON.stringify(this.step.delta, null, 2));
        this.evalCodeChanges(EditContext.UserTyped);
      }
    } catch (e) {
      this.feedback = 'Caught an exception: ' + e;
      this.eventService.recordEvent('playback-exception', this.project.id, {
        feedback: this.feedback,
        delta: cleanCopyDelta(this.step.delta)
      });
      // complain('Caught an exception: ' + e);  wow, this kills the whole app when it throws an exception
    }
  }

  // Only called by evalCodeChanges when all changes for a step are complete.
  private finalizeStepBecauseAllCodeChangesAreComplete(editContext: EditContext) {

    // If this is a project update step, don't do it automatically.
    if (editContext === EditContext.UserTyped && this.playPlanMgr.isProjectUpdateStep) {
      // Nothing has really happened yet, this is just first event that fires.
      return;
    }

    // Remember we can advance.
    this.canAdvance = true;

    // Copy over changes.
    StepAdapter.copyDeltaJustProjectPlanPart(this.driverStep, this.step, this.fs.fileSystem);

    // Maybe they're done the whole tutorial.
    if (this.isLastStepInAuthorProject) {
      this.projectService.markProjectAsDone(this.project);
    }
  }

  // User's changes have been applied to the current step, so check them out. Called in 2 contexts:
  //   1. User typed at least one character and there are no syntax errors.
  //   2. doTypeForMe called, either:
  //      a. Type For Me
  //      b. Update Project Plan
  private evalCodeChanges(editContext: EditContext) {
    // Clear any previous marker.
    // console.log('evalCodeChanges called');
    if (this.lastMarker) {
      this.lastMarker.clear();
    }

    // Compare expected patches with user's patches.
    if (this.messAroundMode) {
      // Nothing to check.
      this.feedback = "";  // Clear out any previous error message.
    } else {
      let wrongChange: IWrongChange = giveFeedbackOnDelta(this.driverStep, this.step);
      if (!wrongChange) {
        // Patches are perfect - they are done this step!
        this.eventService.recordEvent('changes-complete', this.project.id, null);
        this.feedback = "";  // Doesn't really matter, text is in html template
        this.finalizeStepBecauseAllCodeChangesAreComplete(editContext);
      } else {
        // Show feedback.
        this.feedback = wrongChange.getFeedbackStr();
        this.eventService.recordEvent('feedback', this.project.id, {
          wrongChangeString: this.feedback,
          delta: cleanCopyDelta(this.step.delta)
        });

        // Highlight the difference.
        let location = wrongChange.getLocation();
        let editor = this.fileEditor.getCMEditor();
        if (location) {
          this.lastMarker = editor.markText(location.from, location.to, {
            className: "styled-background",
            clearOnEnter: true
          });
        }
      }
    }

    // Auto save + run.
    // Keep this at end, so that any changes to this.step (e.g., in finalizeStepBecauseAllCodeChangesAreComplete()) are saved.
    this.doSaveAndPreview();
  }

  //noinspection JSUnusedGlobalSymbols
  doShowReference() {
    this.showReference = true;
  }

  //noinspection JSUnusedGlobalSymbols
  doHideReference() {
    this.showReference = false;
  }

  //noinspection JSUnusedGlobalSymbols,JSMethodCanBeStatic
  doClickProjectPlan() {
    alert("Don't worry, I'll update the project plan as we go.");
  }
}
