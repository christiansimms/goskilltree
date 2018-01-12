import {Component, EventEmitter, OnInit, Output, ViewChild} from '@angular/core';
import * as recast from 'recast';
import {complain} from "../ast/utils";
import {parseAstHtml} from "../ast/html/html.ast";

declare let esprima: any;
declare let CodeMirror: any;
// declare let JSHINT: any;


// Override JSHINT so that we know if there are errors.
// Since JSHINT is called after a delay, there's a delay between the codemirror on-change event and jshint finishing.
let oldJavascriptValidator = CodeMirror.helpers.lint.javascript;
function javascriptValidator(text, options) {
  // console.log('DEBUG.In my javascriptValidator', options);
  let result = oldJavascriptValidator(text, options.realJshintOptions);  // Use the jshintOptions.options below.

  // Run my callback. Let it hide error messages on page by returning its output.
  let myCustomCallback = options.customJshintOptions.myCustomCallback;
  return myCustomCallback(result, text);
}

CodeMirror.registerHelper("lint", "javascript", javascriptValidator);


// Same as above, but for htmlhint.
let oldHtmlValidator = CodeMirror.helpers.lint.html;
function htmlValidator(text, options) {
  // console.log('DEBUG.In my htmlValidator', text);
  let result = oldHtmlValidator(text);

  // Run my callback. Let it hide error messages on page by returning its output.
  let myCustomCallback = options.customJshintOptions.myCustomCallback;
  return myCustomCallback(result, text);
}
CodeMirror.registerHelper("lint", "html", htmlValidator);


@Component({
  selector: 'app-code-mirror-editor',
  template: `
    <textarea #editor></textarea>
  `,
  styles: []
})
export class CodeMirrorEditorComponent implements OnInit {

  // Every time a key is hit, we send a textChanged event. The caller needs to store the new text in its permanent home.
  @Output() textChanged = new EventEmitter();

  // Every time cursor moves, send an event.
  @Output() cursorActivityEvent = new EventEmitter();

  // Every time user makes a change, send this event.
  @Output() beforeChangeEvent = new EventEmitter();

  // After 500ms debounce, language-appropriate linter is called, and our function myCustomCallback is called,
  // which either emits {errors: errors} if there are lint problems, or it emits the updated AST.
  @Output() astChanged = new EventEmitter();

  // Real html container element for the CodeMirror editor.
  @ViewChild('editor') editor;
  cm: any;  // CodeMirror;
  debounceTimeout = 500;  // 1000;

  constructor() {
  }

  ngOnInit() {
  }

  createEditor() {
    let me = this;

    this.cm = new CodeMirror.fromTextArea(this.editor.nativeElement, {
      extraKeys: {"Ctrl-Space": "autocomplete"}, // needed to enable hints
      lineNumbers: true,
      gutters: ["CodeMirror-lint-markers"],
      // lint: cmJshintOptions,  set later, in activateLint, when we're ready
      mode: {name: "javascript", globalVars: true}  // 2017-05-22: I don't remember what this does, something about ctrl-space auto-complete I think.
    });

    this.cm.on('change', (/*cm*/) => {
      let value = this.cm.getDoc().getValue();
      // console.log("DEBUG.on change: ", value);
      me.textChanged.emit(value); // TODOperf: just updates text string after every keypress. Could call timeout, and only call if changed.
    });

    this.cm.on('cursorActivity', (cm) => {
      let cursor = cm.getCursor();
      // console.log("DEBUG.on cursorActivity: ", cursor);  // TODO-imp
      me.cursorActivityEvent.emit(cursor);  // example: { ch: 9, line: 0, sticky: "after", xRel: -1 }
    });

    this.cm.on('beforeChange', (cm, change) => {
      // console.log("DEBUG.on beforeChange: ", change);  // TODO-imp
      me.beforeChangeEvent.emit(change);
    });
  }

  activateLint() {
    let me = this;
    // Define custom callback here, to capture "this" as "me".
    function myCustomCallback(errors, text) {
      // console.log('DEBUG.myCustomCallback', errors);
      if (!errors || errors.length === 0) {
        let modeObj = me.cm.getMode();  // me.cm.getOption("mode");  bummer, this.cm is not available at construction time
        // console.log('Editor lint mode: ', modeObj);
        let mode = modeObj.helperType;
        if (mode === 'javascript' || mode === 'text/javascript') {
          let ast = recast.parse(text, {parser: esprima});  // Need to pass default value esprima b/c of recast packaging issues.
          me.astChanged.emit(ast);
        } else if (mode === 'html' || mode === 'text/html') {
          let ast = parseAstHtml(text);
          me.astChanged.emit(ast);
        } else if (mode === 'gfm') {
          // Nothing to do.
        } else {
          complain('Did not recognize mode: ' + mode);
        }
        return errors;
      } else {
        // console.log('DEBUG.jshintCallback skipped AST b/c of errors: ', errors);
        me.astChanged.emit({errors: errors});
        return errors;
      }
    }

    // Below, they reorganized the options to lint.
    // Require double quotmark's, since recast always generates that (recast doesn't have smart quote generation).
    let cmJshintOptions = {delay: this.debounceTimeout,
      options: {
        realJshintOptions: {quotmark: "double", esversion: 6},
        customJshintOptions: {myCustomCallback: myCustomCallback}
      }
    };  // , async: true};
    this.cm.setOption('lint', cmJshintOptions);
  }

  getCMEditor() {
    return this.cm;
  }
}
