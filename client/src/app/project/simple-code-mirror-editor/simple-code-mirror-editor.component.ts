import {Component, EventEmitter, Input, OnInit, Output, ViewChild} from '@angular/core';

declare let CodeMirror: any;

// Like CodeMirrorEditor, but simpler. Much, much simpler.
@Component({
  selector: 'app-simple-code-mirror-editor',
  template: `
    <textarea #editor></textarea>
  `,
  styles: []
})
export class SimpleCodeMirrorEditorComponent implements OnInit {

  // Every time a key is hit, we send a textChanged event. The caller needs to store the new text in its permanent home.
  @Output() textChanged = new EventEmitter();

  // Real html container element for the CodeMirror editor.
  @ViewChild('editor') editor;
  cm: any;  // CodeMirror;

  @Input() mode: string = '';
  @Input() text: string = '';

  constructor() {
  }

  ngOnInit() {
    // console.log('INSIDE ngOnInit: ', this.mode, this.text);
    this.createEditor();
  }

  createEditor() {
    let me = this;

    this.cm = new CodeMirror.fromTextArea(this.editor.nativeElement, {
      extraKeys: {"Ctrl-Space": "autocomplete"}, // needed to enable hints
      lineNumbers: true,
      gutters: ["CodeMirror-lint-markers"]
    });

    // Put in current stuff.
    this.cm.setOption("mode", this.mode);
    if (this.mode === 'gfm') {  // Cute: hack or genius?
      this.cm.setOption("lineWrapping", true);
    }
    this.cm.setValue(this.text);

    this.cm.on('change', (/*cm*/) => {
      let value = this.cm.getDoc().getValue();
      // console.log("DEBUG.on change: ", value);
      me.textChanged.emit(value);
    });
  }
}
