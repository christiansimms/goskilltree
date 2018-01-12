import {Component, ElementRef, EventEmitter, Injectable, OnInit, ViewChild} from '@angular/core';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  CanDeactivate,
  Params,
  RouterStateSnapshot
} from '@angular/router';
import {IAuthorProject, AuthorService, IAuthorStep, cleanCopyAuthorProject} from "../author.service";
import {injectIframe, createPopupWindow, clearIframe} from "../../project/ast/sandbox";
import {getAutoPromptForDelta, giveFeedbackOnJshintErrors} from "../../project/ast/prompt";
import {
  complain, FileSystemContainer,
  FileSystemEditEvent, StepAdapter, FileEntry, deepEqualIgnoreWhiteSpace, renderMarkdownAsHtml, assert
} from "../../project/ast/utils";
import {calcFSForAuthor, validatePatchesAreSupported} from "../author-calc";
import {AuthorPlanMgr, PlayPlanMgr} from "../../project/project-plan";
import {suggestSkills} from "../../common/skilltree-mgr";
import {FlashService} from "../../common/flash.service";
import {Observable} from "rxjs/Observable";
import {Subject} from "rxjs/Subject";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {deepCopy} from "../../common/jsutils";


const debugTestApplyPatches = true;


// TODOXXX: if other pages get this also, read to generalize this: http://stackoverflow.com/questions/35922071/warn-user-of-unsaved-changes-before-leaving-page
@Injectable()
export class AuthorStepPageComponentPendingChangesGuard implements CanDeactivate<AuthorStepPageComponent> {
  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  canDeactivate(component: AuthorStepPageComponent,
                route: ActivatedRouteSnapshot,
                state: RouterStateSnapshot): Observable<boolean>|Promise<boolean>|boolean {
    return component.componentCanDeactivate() ?
      true :
      // NOTE: this warning message will only be shown when navigating elsewhere within your angular app;
      // when navigating away from your angular app, the browser will show a generic warning message
      // see http://stackoverflow.com/a/42207299/7307355
      confirm('WARNING: You have unsaved changes. Press Cancel to go back and save these changes, or OK to lose these changes.');
  }
}


@Component({
  selector: 'app-author-step-page',
  templateUrl: './author-step-page.component.html',
  styles: []
})
export class AuthorStepPageComponent implements OnInit {
  @ViewChild('iframe') iframe: ElementRef;
  project: IAuthorProject;
  origProject: IAuthorProject;  // Must be updated everywhere this.project changes.
  stepNum: number;
  step: IAuthorStep;
  prevfs: FileSystemContainer;  // The previous step's file system.
  fs: FileSystemContainer;  // file_system is not stored in author projects (just deltas), so keep it here
  todoTreeChanges;
  playPlanMgr: PlayPlanMgr;
  authorPlanMgr: AuthorPlanMgr;
  suggestedSkills: Subject<any[]> = new BehaviorSubject([]);

  showTodoHierarchy: boolean = false;  // TODO: delete if not used
  //noinspection JSUnusedGlobalSymbols
  showFileEditor: boolean = true;
  showCodePreview: boolean = true;
  showReference: boolean = false;

  // Debugging-type content. Public for html template.
  public authorFeedback: Subject<string> = new BehaviorSubject('');
  public authorFeedbackProblems: Subject<string> = new BehaviorSubject('');  // Make problems jump out.
  public debugJsonDelta: Subject<string> = new BehaviorSubject('');
  public descriptionAsHtml: Subject<string> = new BehaviorSubject('');


  constructor(private route: ActivatedRoute, private authorService: AuthorService, private flashService: FlashService) {
  }

  //noinspection JSUnusedGlobalSymbols
  ngOnInit() {

    this.route.params.subscribe((params: Params) => {
      let projectId = +params['projectId'];
      this.stepNum = +params['stepNum'];
      this.step = null;  // yuck: needed to reset app-simple-code-mirror-editor which has guard: *ngIf="step"

      // Load session.
      this.authorService.loadProject(projectId).then(project => {
        this.project = project;
        this.origProject = deepCopy(project);
        this.step = this.project.steps[this.stepNum];

        // Clear out anything from previous step, since navigating between pages does not reset this component
        // if previous page was same as this one.
        this.authorFeedback.next('');
        this.authorFeedbackProblems.next('');
        this.debugJsonDelta.next('');
        this.descriptionAsHtml.next('');
        clearIframe(this.iframe);  // Don't want to see a previous version of app running.

        try {
          [this.prevfs, this.fs] = calcFSForAuthor(this.project, this.stepNum);
          // Author will use PlayPlanMgr for hilighting, so that it works exactly the way play works.
          this.playPlanMgr = new PlayPlanMgr(this.step, this.prevfs);
          this.todoTreeChanges = new EventEmitter();
          this.todoTreeChanges.subscribe(event => this.todoTreeChanged(event));

          // Recalculate project plan state after navigation.
          let plandb = this.fs.maybeFindFile('db/todo.json');
          if (plandb) {
            // console.log('Calling init for todoTreeChanged');
            this.todoTreeChanged(plandb);
          }
        } catch (e) {
          console.log('Error in author', e);
          this.authorFeedbackProblems.next('Problem applying patches for this step: ' + e);
        }
      });
    });
  }

  componentCanDeactivate(): boolean {
    // Need to ignore white space for situation: write change like rect(0,0,10,10);  it will be reformatted to: rect(0, 0, 10, 10);
    // This is not perfect, but this is only for author.
    let a = cleanCopyAuthorProject(this.project);
    let b = cleanCopyAuthorProject(this.origProject);
    let eq = deepEqualIgnoreWhiteSpace(a, b);
    if (eq) {
      return true;
    } else {
      console.log('Unsaved changes', a, b);
      return false;
    }
  }

  //noinspection JSUnusedGlobalSymbols
  descriptionWasChanged(newValue) {
    if (this.step) {
      this.step.description = newValue;
      this.descriptionAsHtml.next(renderMarkdownAsHtml(newValue));
      // console.log('DEBUG.descriptionWasChanged', html);
    }
  }

  private saveProjectUpdateEditorState() {
    this.origProject = deepCopy(this.project);
    return this.authorService.saveProject(this.project);
  }

  //noinspection JSUnusedGlobalSymbols
  doSaveAndPreview() {
    this.doShowPreview();
    this.saveProjectUpdateEditorState().then(() => {
      injectIframe(this.iframe, this.fs.fileSystem);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  doSaveAndPopup() {
    this.saveProjectUpdateEditorState().then(() => {
      createPopupWindow(this.fs.fileSystem);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  doMakeNextStep() {
    this.authorService.makeNextStepNoSave(this.project);
    this.saveProjectUpdateEditorState().then(() => {
      let newStepNum = this.project.steps.length - 1;
      this.flashService.tellSuccess('Made new step #' + newStepNum, '/author/' + this.project.id + '/step/' + newStepNum);
    });
  }

  //noinspection JSUnusedGlobalSymbols
  astWasChanged(event: FileSystemEditEvent) {
    try {
      let newAst = event.newAst;

      // console.log('DEBUG.astWasChanged', event);
      if (!this.fs) {
        // Code editor was loaded before our data was loaded. Just wait.
        this.debugJsonDelta.next('TODO - AST came before data loaded');
      } else if (newAst.errors) {
        // There are JSHINT errors.
        this.authorFeedbackProblems.next('Fix jshint problems');
        this.debugJsonDelta.next(giveFeedbackOnJshintErrors(newAst.errors));
      } else {
        StepAdapter.updateDelta(this.step, this.prevfs, event);
        this.debugJsonDelta.next(JSON.stringify(this.step.delta, null, 2));

        // Test that patching can handle this. Why? It's *so* annoying to make a change, and find out later it doesn't work.
        //noinspection ConstantIfStatementJS
        if (debugTestApplyPatches) {
          let problems: string[] = validatePatchesAreSupported(this.fs, this.prevfs, this.step);
          // console.log('Validating patches, any problems?', problems);  // kind of a reminder we're doing this expensive operation
          if (problems) {
            console.error('Unable to handle patch\n', problems);
            this.authorFeedbackProblems.next(problems.join('\n')); // 'PROBLEM: Unable to handle patch, see log for details');
          } else {
            let out = [];
            out.push('I can handle your patches so far.');

            // Check project plan updates.
            if (StepAdapter.isOnlyProjectPlanUpdateStep(this.step)) {
              out.push('This is a project plan update step.');
            } else {
              out.push('This is not a project plan update step.');
            }

            // Summarize project plan.
            if (this.authorPlanMgr) {
              out.push(this.authorPlanMgr.summarizeStep());
            } else {
              out.push('AuthorPlanMgr not yet created');
            }

            // Look at skills.
            let skills = suggestSkills(this.project, this.step);
            out.push('Suggested skills: ' + skills.join(', '));
            setTimeout(() => {  // 2017-05-22: this was needed after CodeMirror reorg, surprisingly.
              this.suggestedSkills.next(skills);
            });

            // Figure out prompt.
            let autoPromptList = getAutoPromptForDelta(this.step.delta);
            autoPromptList.forEach(prompt => {
              out.push('PROMPT: ' + prompt);
            });

            this.authorFeedbackProblems.next('');
            this.authorFeedback.next(out.join('\n'));  // Yes, html uses: style="white-space: pre"
          }
        }
      }
    } catch (e) {
      // this.feedback = 'Caught an exception: ' + e;  // TODO
      complain(e);
    }
  }

  //noinspection JSUnusedGlobalSymbols
  todoTreeChanged(newAst) {
    // console.log('DEBUG.tree', newAst);

    // Recreate this each time.
    this.authorPlanMgr = new AuthorPlanMgr(newAst, this.playPlanMgr);

    let entry: FileEntry = <FileEntry><any>{name: 'db/todo.json', contents: newAst};
    let event: FileSystemEditEvent = {fileEntry: entry, newAst: newAst};
    this.astWasChanged(event);
  }

  //noinspection JSUnusedGlobalSymbols
  createEmptyTodo() {
    // Make sure item exists.
    let item = this.fs.maybeFindFile('db/todo.json');
    if (!item) {
      // Create it.
      let contents = [{id: 1, title: 'Tasks go here'}];
      this.fs.addFileEntry('db/todo.json', contents);
      let entry: FileEntry = <FileEntry><any>{name: 'db/todo.json', contents: contents};
      let event: FileSystemEditEvent = {fileEntry: entry, newAst: contents};
      StepAdapter.updateDelta(this.step, this.prevfs, event);

      // Refresh UI.
      this.todoTreeChanged(contents);
    }

    this.showTodoHierarchy = true;
    this.showCodePreview = false;
  }

  //noinspection JSUnusedGlobalSymbols
  markIncompletePlanItemAsDone() {
    this.authorPlanMgr.markDone();

    // Update delta.
    let plandb = this.fs.maybeFindFile('db/todo.json');
    assert(plandb, 'Need db/todo.json');
    this.todoTreeChanged(plandb);
  }

  //noinspection JSUnusedGlobalSymbols
  addSkill(skill) {
    // Add to skill list.
    let activeItem = this.authorPlanMgr.getActivePlanItem();
    if (!activeItem.skills) {
      activeItem.skills = [];
    }
    activeItem.skills.push(skill.id);

    // Update delta.
    let plandb = this.fs.maybeFindFile('db/todo.json');
    assert(plandb, 'Need db/todo.json');
    this.todoTreeChanged(plandb);
  }

  //noinspection JSUnusedGlobalSymbols
  doShowPreview() {
    this.showTodoHierarchy = false;
    this.showCodePreview = true;
  }

  //noinspection JSUnusedGlobalSymbols
  doShowReference() {
    this.showReference = true;
  }

  //noinspection JSUnusedGlobalSymbols
  doHideReference() {
    this.showReference = false;
  }

}

