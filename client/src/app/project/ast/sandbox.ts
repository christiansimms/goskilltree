import {ElementRef} from '@angular/core';
import {FileSystem, complain, prettyPrintAstJs} from "./utils";
import * as recast from 'recast';
import {parsePatchAstJsBasedOnContext, parseAstWithMultipleThings, parseAstJs} from "./js/js.parse";


function renameP5UserFunctions(ast: any): void {
  //noinspection JSUnusedGlobalSymbols
  recast.visit(ast, {  // NOTE: recast.visit has side effect of creating some null field values.
    visitFunctionDeclaration: function (path) {
      let fn = path.node;
      // console.log('DEBUG', path, fn);
      if (fn.id.name === 'setup') {
        fn.id.name = '__user_setup_fn';
      } else if (fn.id.name === 'draw') {
        fn.id.name = '__user_draw_fn';
      }

      this.traverse(path);
    }
  });
}

// Below came from: http://tobyho.com/2012/07/27/taking-over-console-log/
let consoleFn = `
function showConsoleInBrowser(args) {
    let consoler = document.getElementById("consoler");
    if (!consoler) {
        // Create it.
        let consolerHtml = '<div><h2>Console Output</h2><div id="consoler"></div></div>';
        document.body.insertAdjacentHTML('beforeend', consolerHtml);
        consoler = document.getElementById("consoler");
    }
    let newElement = document.createElement('div');
    let message = Array.prototype.slice.apply(args).join(' ');
    let newContent = document.createTextNode(message);
    newElement.appendChild(newContent); //add the text node to the newly created div.
    consoler.insertAdjacentElement('beforeend', newElement);
}
function takeOverConsole() {
    let console = window.console;
    if (!console) return;
    function intercept(method){
        let original = console[method];
        console[method] = function() {
            // do sneaky stuff
            if (original.apply) {
                // Do this for normal browsers
                original.apply(console, arguments);
            } else {
                // Do this for IE
                let message = Array.prototype.slice.apply(arguments).join(' ');
                original(message);
            }
            showConsoleInBrowser(arguments);
        }
    }
    let methods = ['log', 'warn', 'error'];  // skip console.info, so we can debug with it :-)
    for (let i = 0; i < methods.length; i++) {
        intercept(methods[i]);
    }
}
takeOverConsole();
`;

// Make a bigger canvas.
// Change frameRate f/default of 60 to 5, otherwise logging in draw() is too much.
// Run user's setup function if defined.
let setupFn = `
  function setup() {
    let canvas = createCanvas(400, 400);
    canvas.parent("canvasContainer");
    frameRate(5);

    window.__user_setup_fn ? window.__user_setup_fn(): 0;
  }
`;

// Run user's draw function if defined.
let drawFn = `
  function draw() {
    window.__user_draw_fn ? window.__user_draw_fn(): 0;
  }
`;

function addP5Functions(ast: any): void {
  ast.program.body.push(parsePatchAstJsBasedOnContext(setupFn, 'regular'));
  ast.program.body.push(parsePatchAstJsBasedOnContext(drawFn, 'regular'));
}

// Add console intercept to beginning.
function addConsoleIntercept(ast: any): void {
  // ast.program.body.splice(0, 0, ...parseAstWithMultipleThings(consoleFn));  // not ready to use spread yet
  let parts = parseAstWithMultipleThings(consoleFn);
  for (let index = 0; index < parts.length; index++) {
    let part = parts[index];
    ast.program.body.splice(index, 0, part);
  }
}

// Given user-written contents, return safer version.
function getSafeSketch(contents: string) {
  let ast = parseAstJs(contents);
  renameP5UserFunctions(ast);
  addP5Functions(ast);
  addConsoleIntercept(ast);
  return prettyPrintAstJs(ast);
}

// Given user-written contents, return safer version.
function getSafeApp(contents: string) {
  let ast = parseAstJs(contents);
  addConsoleIntercept(ast);
  return prettyPrintAstJs(ast);
}

function indexUsesP5(index) {
  return index.indexOf('p5.js') >= 0;
}

// Inject all files in fileSystem into iframe.
function _injectContent(doc: any, fileSystem: FileSystem) {

  // Get index.html
  let indexFile = fileSystem[0];
  if (indexFile.name !== 'index.html') {
    complain('Did not find expected file: ' + indexFile.name);
  }

  let newContents;
  if (indexUsesP5(indexFile.contents)) {
    // Get sketch.js
    let sketchFile = fileSystem[1];
    if (sketchFile.name !== 'sketch.js') {
      complain('Did not find expected file, instead found: ' + sketchFile.name);
    }
    let sketchScriptTag = '<script type="text/javascript">' + getSafeSketch(sketchFile.contents) + '</script>';

    // Insert scripts into file.
    newContents = indexFile.contents.replace('<script src="sketch.js"></script>', sketchScriptTag);
  } else {
    // Assume it's app.js
    // Get app.js
    let appFile = fileSystem[1];
    if (appFile.name !== 'app.js') {
      complain('Did not find expected file, instead found: ' + appFile.name);
    }
    let appScriptTag = '<script type="text/javascript">' + getSafeApp(appFile.contents) + '</script>';

    // Insert scripts into file.
    newContents = indexFile.contents.replace('<script src="app.js"></script>', appScriptTag);
  }

  // Write contents.
  doc.open();
  doc.write(newContents);
  doc.close();
}

// Inject all files in fileSystem into iframe.
function _injectIframe(iframe: ElementRef, fileSystem: FileSystem) {
  // Inject current fileSystem into iframe.
  let doc = iframe.nativeElement.contentDocument || iframe.nativeElement.contentWindow;
  _injectContent(doc, fileSystem);
}

export function clearIframe(iframe: ElementRef): void {
  iframe.nativeElement.src = 'about:blank';
}

// Clear out iframe, then inject all files in fileSystem into iframe.
export function injectIframe(iframe: ElementRef, fileSystem: FileSystem) {
  // To refresh: clear out iframe completely (otherwise you get errors about duplicate class declarations).
  // And you need the setTimeout or else the browser doesn't have time to clear the iframe.
  clearIframe(iframe);
  setTimeout(() => {
    _injectIframe(iframe, fileSystem);
  });
}

export function createPopupWindow(fileSystem: FileSystem) {
  let win = window.open('about:blank', "PopupWindowName", "resizable=yes,scrollbars=yes,status=yes,toolbar=yes");
  _injectContent(win.document, fileSystem);
}

