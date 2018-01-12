import {Component, EventEmitter, Input, OnInit, Output, ViewChild} from '@angular/core';

declare let SimpleMDE: any;

@Component({
  selector: 'app-simple-mdecomponent',
  template: `
<textarea #editor></textarea>
  `,
  styles: []
})
export class SimpleMDEComponentComponent implements OnInit {

  @Output() textChanged = new EventEmitter();
  @ViewChild('editor') editor;
  simplemde: any;

  constructor() {
  }

  ngOnInit() {
    // .nativeElement is only available after ngOnInit, not in constructor.
  }

  createEditor() {
    this.simplemde = new SimpleMDE({element: this.editor.nativeElement});

    let me = this;
    this.simplemde.codemirror.on('change', (/*cm*/) => {
      let value = this.simplemde.value();
      // console.log("DEBUG.on change: ", value);
      me.textChanged.emit(value); // TODOfuture: timeout, and only call if changed
    });

  }

  //noinspection JSMethodCanBeStatic
  @Input() set text(text: any) {
    // console.log('DEBUG.SimpleMDEComponentComponent @Input.text');
    if (!this.simplemde) {
      this.createEditor();
    }
    this.setText(text);
  }

  setText(text: any) {
    if (text == null)
      text = "";

    // Only call setValue() if value changed. Needed or else binding [text] directly to a variable gets side effects.
    let oldValue = this.simplemde.value();
    if (oldValue !== text) {
      this.simplemde.value(text);
    }
  }

}
