import {Component, EventEmitter, Input, OnInit, Output, Pipe, PipeTransform, ViewChild} from '@angular/core';
import {
  FileEntry, getFileTypeFromNameCodeMirror, FileSystemEditEvent, FileSystemFindFile, FileSystem
} from "../ast/utils";
import {CodeMirrorEditorComponent} from "../code-mirror-editor/code-mirror-editor.component";


declare let CodeMirror: any;

export function filterFilesNoProjectPlan(items: FileEntry[]) {
  return items.filter(item => !item.name.endsWith('.json'));
}

@Pipe({name: 'allButJsonFiles'})
export class AllButJsonFiles implements PipeTransform {
  transform(items: FileEntry[]): FileEntry[] {
    // Jump out if data not yet ready.
    if (!items) {
      return items;
    } else {
      return filterFilesNoProjectPlan(items);
    }
  }
}

@Component({
  selector: 'app-cmfile-editor',
  template: `
    <ul class="nav nav-tabs">
      <li role="presentation" *ngFor="let fileEntry of _fileSystem | allButJsonFiles"
          [ngClass]="{'active': fileEntry.name === currentFileEntry?.name}">
        <a href="#" (click)="selectFile(fileEntry)">{{fileEntry.name}}</a>
      </li>
    </ul>
    <app-code-mirror-editor #cmeditor
                            (textChanged)="textWasChanged($event)"
                            (cursorActivityEvent)="cursorActivityEventCB($event)"
                            (beforeChangeEvent)="beforeChangeEventCB($event)"
                            (astChanged)="astWasChanged($event)"></app-code-mirror-editor>
  `,
  styles: []
})
export class CMFileEditorComponent implements OnInit {

  //noinspection JSUnusedGlobalSymbols
  public _fileSystem: FileSystem;  // make public b/c used in html
  currentFileEntry: FileEntry; // current file
  cmDocs = {};
  @Output() cursorActivityEvent = new EventEmitter();
  @Output() beforeChangeEvent = new EventEmitter();
  @Output() astChanged = new EventEmitter();
  @ViewChild('cmeditor') cmeditor: CodeMirrorEditorComponent;

  constructor() {
  }

  ngOnInit() {
    // We're not initializing the component here, instead we're waiting for fileSystem to be set.
    // Why? Because we had timing issues with jshint when creating it immediately.
  }

  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  @Input()
  set currentDisplayedFile(fileName: string) {
  }

  @Input()
  set fileSystem(fileSystem: any) {
    this._fileSystem = fileSystem;
    if (this._fileSystem) { // This is called twice, and the first time this is null, since the data is loaded async.

      // Create cmeditor if it doesn't exist. As user navigates inside author or play, the same instance of
      // CMFileEditorComponent gets initialized with different fileSystems. The CodeMirrorEditorComponent also
      // stays the same, so we don't need to create it again.
      let cmeditorAlreadyExists = !!this.cmeditor.cm;
      // console.log('DEBUG.cmfile-editor, cmeditorAlreadyExists=' + cmeditorAlreadyExists);
      if (!cmeditorAlreadyExists) {
        this.cmeditor.createEditor();
      }

      let files: FileEntry[] = filterFilesNoProjectPlan(this._fileSystem);
      let lastEntry: FileEntry = files[files.length - 1];  // TODOfuture: use currentDisplayedFile instead of always pick last file
      this.refreshFromFileSystem(lastEntry.name);

      if (!cmeditorAlreadyExists) {
        // 2017-12-15: when loading class PlayStepPageComponent, activateLint caused nasty
        // error ExpressionChangedAfterItHasBeenCheckedError, that's why we're calling setTimeout below.
        setTimeout(() => {
          this.cmeditor.activateLint();
        });
      }
    }
  }

  //noinspection JSUnusedGlobalSymbols
  selectFile(fileEntry: FileEntry) {
    // We remember it.
    this.currentFileEntry = fileEntry;

    // Make CodeMirror editor remember it. swapDoc() is important, it maintains undo history and modes per file.
    this.cmeditor.cm.swapDoc(this.cmDocs[fileEntry.name]);

    return false;  // stop click navigation
  }

  // Update text file after every keypress! Not super fast, but super easy!
  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  textWasChanged(newValue) {
    // console.log('DEBUG.textWasChanged: ' + newValue);
    if (this.currentFileEntry) {
      this.currentFileEntry.contents = newValue;
    }
  }

  // Pass-through event.
  cursorActivityEventCB(event) {
    this.cursorActivityEvent.emit(event);
  }

  // Pass-through event.
  beforeChangeEventCB(event) {
    this.beforeChangeEvent.emit(event);
  }

  // Pass-through AST change to parent.
  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  astWasChanged(newAst) {
    // console.log('DEBUG.cmfile.astWasChanged: ' + newAst);
    this.astChanged.emit(new FileSystemEditEvent(this.currentFileEntry, newAst));
  }

  getCMEditor() {
    return this.cmeditor.getCMEditor();
  }

  // File system has changed underneath us, let us refresh the display.
  refreshFromFileSystem(filename: string) {

    // Delete any old entries.
    this.cmDocs = {};

    // Create CodeMirror docs for all documents, to maintain undo history for each separately.
    let files: FileEntry[] = filterFilesNoProjectPlan(this._fileSystem);
    for (let fileEntry of files) {
      this.cmDocs[fileEntry.name] = new CodeMirror.Doc(fileEntry.contents, getFileTypeFromNameCodeMirror(fileEntry.name));
    }

    let entry = FileSystemFindFile(this._fileSystem, filename);
    this.selectFile(entry);
  }
}
