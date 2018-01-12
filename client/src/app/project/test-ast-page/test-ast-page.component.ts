import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {
  compareAstJs, IJsonPatch, applyJsonPatches, cleanCopyPatches,
  compareAstHtml, compareAstJson
} from "../ast/astdiff";
import {
  prettyPrintAstJs, assertDeepEqual,
  getLangAdapter, complain, deepEqual
} from "../ast/utils";
import {parseAstHtml, prettyPrintAstHtml} from "../ast/html/html.ast";
import {
  AuthorService, IAuthorStep, IDeltaEntry,
  validateAuthorProjectSchema
} from "../../author/author.service";
import {getAutoPromptForDelta, giveFeedbackOnDelta} from "../ast/prompt";
import {computePartialAddContextForHtml, computePartialReplaceDeleteContextForHtml} from "../ast/html/html.context";
import {HttpService} from "../../common/http.service";
import {IWrongChange} from "../ast/astcmp";
import {IStep} from "../project.service";
import {validateAuthorProjectChanges} from "../../author/author-calc";
import {parseAstJs} from "../ast/js/js.parse";
import {deepCopy} from "../../common/jsutils";


function makeFakeDeltaJs(patches: IJsonPatch[]): IDeltaEntry[] {
  return [{filename: 'fake.js', diffs: patches}];
}

function makeFakeDeltaHtml(patches: IJsonPatch[]): IDeltaEntry[] {
  return [{filename: 'fake.html', diffs: patches}];
}


@Component({
  selector: 'app-test-ast-page',
  template: `<p>Ran tests, see console.log.</p>
<button type="button" class="btn btn-default" (click)="runTests()">Re-Run Tests</button>
<br/><br/>
<h3>Current Tutorials</h3>
<button type="button" class="btn btn-default" (click)="importProject('JavaScript - Intro-v1.json')">Load JavaScript - Intro Project</button>
<br/><br/>
<button type="button" class="btn btn-default" (click)="importProject('p5.js - Intro-v2.json')">Load p5.js - Intro Project</button>
<button type="button" class="btn btn-default" (click)="importProject('p5.js - Paint-v2.json')">Load p5.js - Paint Project</button>
<br/><br/>
<h3>Postponed</h3>
<button type="button" class="btn btn-default" (click)="importProject('Vue.js - Intro.json')">Load Vue.js - Intro Project</button>
<button type="button" class="btn btn-default" (click)="importProject('Vue.js - Component.json')">Load Vue.js - Component Project</button>
<br/><br/>
<button type="button" class="btn btn-default" (click)="importProject('project-Wall.json')">Load project-Wall</button>
`,
  styles: []
})
export class TestAstPageComponent implements OnInit {

  constructor(/*private projectService: ProjectService,*/ private authorService: AuthorService, private router: Router, private httpService: HttpService) {
    try {
      this.runTests();
    } catch (e) {
      // Catch exception so we don't get redirected back by angular by uncaught exception.
      console.error('TEST FAILED', e);
    }
  }

  runTests() {
    this.testJsExprs();  // TODO

    this.testDeepEqual();
    this.testJsonDiff();
    this.testHtmlParser();
    this.testHtmlContext('add');
    this.testHtmlContext('rd');
    this.testSimpleHtmlDiff();
    this.testDuplicateJsStatement();
    this.testLittleJsThings();
    this.testDuplicateTagHtmlDiff();
    this.testComplexHtmlDiff();
    this.testSimpleJsDiff();
    this.testJsExprs();
    this.testComplexJsDiff();
    this.testComplexJsDiffSmallerChanges();
    this.testJsVariableDecls();
    // 2017-12-6: removed vue support.
    // this.testVueComponentDiff();
    // this.testVueDefinitionDiff();
    // this.testVueDefinitionDiffChangeExisting();
    console.log('Tests passed!');
  }

  testDeepEqual() {
    // Simple types.
    this.assertEqual(deepEqual(1, 1), true);
    this.assertEqual(deepEqual(1, 2), false);

    // Nested.
    this.assertEqual(deepEqual([[1]], [[1]]), true);
    this.assertEqual(deepEqual([[1]], [[2]]), false);
    this.assertEqual(deepEqual([['abc']], [['abc']]), true);
    this.assertEqual(deepEqual([['abc']], [['abd']]), false);

    // Mismatch type.
    this.assertEqual(deepEqual([1], {'a': 1}), false);

    // Ignore white space.
    this.assertEqual(deepEqual('abc', 'abc', /*ignoreWhiteSpace=*/true), true);
    this.assertEqual(deepEqual('abc', 'ab c'), false);  /* test default ignoreWhiteSpace=false */
    this.assertEqual(deepEqual('abc', 'ab c', /*ignoreWhiteSpace=*/true), true);
    this.assertEqual(deepEqual([['abc']], [['ab c']], /*ignoreWhiteSpace=*/true), true);
    this.assertEqual(deepEqual([['abc']], [['ab c']], /*ignoreWhiteSpace=*/true), true);
  }

  // Import a test project.
  //noinspection JSUnusedGlobalSymbols
  importProject(filename) {
    this.httpService.get('/api/test/get_canned_tutorial/' + filename).then(authorProject => {
      let problems = validateAuthorProjectSchema(authorProject);
      if (problems.length > 0) {
        alert('Not saving because problem validating json file: ' + problems);
        return;
      }

      /*problems =*/
      validateAuthorProjectChanges(authorProject);
      // if (problems.length > 0) {
      //   alert('Not saving because cannot handle patches: ' + problems);
      //   return;
      // }

      return this.authorService.saveProject(authorProject).then(authorProjectId => {
        console.log('DONE!!!');
        //noinspection JSIgnoredPromiseFromCall
        this.router.navigate(['/author/' + authorProjectId + '/edit']);
      }, errorMessage => {
        complain(errorMessage);
      });
    });
  }

  testHtmlParser() {

    // Test real example.
    let oneStr = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/vue/dist/vue.js"></script>
</head>
<body>
  <div id="app"></div>
  <script src="app.js"></script>
</body>
</html>
`.trim();
    this.testParsePrint(oneStr);
    this.testParsePrint(this.replaceLine(oneStr, 6, '  <div id="app">Hello</div>'));
    this.testParsePrint(
      this.replaceLine(oneStr, 6, '  <div id="app">\nHel lo\n</div>'),
      this.replaceLine(oneStr, 6, '  <div id="app">Hel lo</div>')
    );
  }

  //noinspection JSMethodCanBeStatic
  testHtmlContext(kind) {
    // Test given stack. REMEMBER: stack is bottom-up, but result is top-down.
    function test(stack, expectResult) {
      stack.reverse();  // So data below is written top-down but stack is bottom-up.
      expectResult.reverse();
      let gotResult = kind === 'add' ? computePartialAddContextForHtml(stack) : computePartialReplaceDeleteContextForHtml(stack);
      assertDeepEqual(gotResult, expectResult);
    }

    let emptyDiv = {type: 'tag', name: 'div', attribs: {}};
    let divWithId = {type: 'tag', name: 'div', attribs: {id: 'me'}};
    test([], []);
    test([divWithId], ['div#me']);
    test([
      emptyDiv,
      divWithId,
    ], ['div#me']);
    test([emptyDiv], ['div']);
    test([
      divWithId,
      emptyDiv,
    ], ['div#me', 'div']);
    test([
      emptyDiv,
      emptyDiv,
      divWithId,
      emptyDiv,
      emptyDiv,
    ], ['div#me', 'div', 'div']);
  }

  // Watch out, white space matters for parsing/serializing in html.
  //noinspection JSMethodCanBeStatic
  testSimpleHtmlDiff() {
    {
      let oneStr = '<p>one</p>';
      let oneAst = parseAstHtml(oneStr);
      let oneAstPrintStr = prettyPrintAstHtml(oneAst);
      this.assertEqual(oneStr, oneAstPrintStr);

      // let twoAst = parseAstHtml('<p style="color: red">one</p>');
      let twoAst = parseAstHtml('<p>one</p>');
      let jsonPatches = compareAstHtml(oneAst, twoAst);
      this.assertEqual(jsonPatches.length, 0);
    }
    { // Test template. It's special in parse5, per the html spec.
      let oneStr = '<template>hi</template>';
      let oneAst = parseAstHtml(oneStr);
      let oneAstPrintStr = prettyPrintAstHtml(oneAst);
      this.assertEqual(oneStr, oneAstPrintStr);
    }
    {
      let oneAst = parseAstHtml(`
<ul>
  <li>one</li>
</ul>`.trim());
      let twoStr = `
<ul>
  <li>one</li>
  <li style="background-color: blue">two</li>
</ul>`.trim();
      let twoAst = parseAstHtml(twoStr);
      let twoAstPrintStr = prettyPrintAstHtml(twoAst);
      this.assertEqual(twoStr, twoAstPrintStr);
      /*let jsonPatches =*/
      compareAstHtml(oneAst, twoAst);
      // console.log('DEBUG.testSimpleHtmlDiff compare', oneAst, twoAst);
      // console.log('DEBUG.testSimpleHtmlDiff result', jsonPatches);
      // this.assertEqual(jsonPatches.length, 1);
    }
  }

  testDuplicateTagHtmlDiff() {
    let oneStr = `
<counter></counter>
<counter></counter>
<counter></counter>
`.trim();
    let oneAst = parseAstHtml(oneStr);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 0, '<counter name="abc"></counter>'), [{
      op: 'add', path: '/counter/attribs/name', prettyValue: 'abc'
    }]);
    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 1, '<counter name="abc"></counter>'), [{
      op: 'add', path: '/counter x2/attribs/name', prettyValue: 'abc'
    }]);
  }

  testDuplicateJsStatement() {
    let oneStr = `
function x() {
  fun();
  fun();
  fun();
}
`.trim();
    let oneAst = parseAstJs(oneStr);

    this.testChangeJS(oneAst, this.replaceLine(oneStr, 1, '  fun(123);'), [{
      op: 'replace', path: '/function x/fun()', prettyValue: 'fun(123);'
    }]);
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, '  fun(123);'), [{
      op: 'replace', path: '/function x/fun() x2', prettyValue: 'fun(123);'
    }]);
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 3, '  fun(123);'), [{
      op: 'replace', path: '/function x/fun() x3', prettyValue: 'fun(123);'
    }]);
  }

  testLittleJsThings() {
    let oneStr = `
function x() {
  fun();
}
function x2() {
  // fun();
}
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Test that single and double quote strings are respected.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 1, "  fun('hello');"), [{
      op: 'replace', path: '/function x/fun()', prettyValue: "fun('hello');"
    }]);
    this.testChangeJS(oneAst, this.insertLine(oneStr, 1, "  fun_x('hello');"), [{
      op: 'add', path: '/function x/#first', prettyValue: "fun_x('hello');"
    }]);
    this.testChangeJS(oneAst, this.insertLine(oneStr, 1, '  fun_x("hello");'), [{
      op: 'add', path: '/function x/#first', prettyValue: 'fun_x("hello");'
    }]);

    // Test comments.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 1, "  //fun();"), [{
      op: 'delete', path: '/function x/fun()', prettyValue: "fun();"
    }, {
      op: 'add', path: '/function x/comments', prettyValue: "//fun();"
    }]);
    // 2017-03-31: not ready for this, too much work:
    // this.testChangeJS(oneAst, this.replaceLine(oneStr, 4, "  // fun(); More docs"), [{
    //   op: 'replace', path: '/function x2/comments', prettyValue: "// fun(); More docs"
    // }]);
  }

  testComplexHtmlDiff() {
    let oneStr = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/vue/dist/vue.js"></script>
</head>
<body>
  <div id="app"></div>
  <div></div>
  <div id="sec" v-on:click="increment"></div>
  <template id="my-template"></template>
  <template id="deep-template"><h1><button>Hey</button></h1></template>
  <template id="deep2"><input type="button"/></template>
  <script src="app.js"></script>
</body>
</html>
`.trim();
    let oneAst = parseAstHtml(oneStr);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 6, '<div id="app">Hello</div>'), [{
        op: 'add', path: '/div#app/#first', prettyValue: 'Hello'
      }], 'I want you to add a string to the beginning of tag div with id=app',
      [[this.replaceLine(oneStr, 6, '<div id="app">Hello xxx</div>'),
        'On line 6, I expected "Hello" but found "Hello xxx".'],
        [this.replaceLine(oneStr, 7, '<div>Hello</div>'),
          'You wrote the code in the wrong location.']
      ]);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 6, '<div id="app">x\n </div>'), [{
      op: 'add', path: '/div#app/#first', prettyValue: 'x'
    }]);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 6, '<div id="app"><h1>Hello</h1></div>'), [{
      op: 'add', path: '/div#app/#first', prettyValue: '<h1>Hello</h1>'
    }], 'I want you to add h1 to the beginning of tag div with id=app');

    this.testChangeHtml(oneAst, this.insertLine(oneStr, 6, '<div id="page">Hi</div>'), [{
      op: 'add', path: '/body/#first', prettyValue: '<div id="page">Hi</div>'
    }]);

    this.testChangeHtml(oneAst, this.insertLine(oneStr, 7, '<div id="page">Hi</div>'), [{
      op: 'add', path: '/body/#after div#app', prettyValue: '<div id="page">Hi</div>'
    }]);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 7, '<div>Hi</div>'), [{
      op: 'add', path: '/body/div/#first', prettyValue: 'Hi'
    }]);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 7, '<div><p>yo</p></div>'), [{
      op: 'add', path: '/body/div/#first', prettyValue: '<p>yo</p>'
    }]);

    // Test template, because it's a funky parse5 DOM.
    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 9, '<template id="my-template">Yo</template>'), [{
      op: 'add', path: '/template#my-template/#first', prettyValue: 'Yo'
    }]);

    // Test deep template, to test simplifyStackWithId.
    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 10, '<template id="deep-template"><h1><button>Hey2</button></h1></template>'), [{
      op: 'replace', path: '/template#deep-template/h1/button/string', prettyValue: 'Hey2'
    }]);

    // Test deep template, add attribute named "type", which had been a problem.
    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 10, '<template id="deep-template"><h1><button type="button">Hey</button></h1></template>'), [{
      op: 'add', path: '/template#deep-template/h1/button/attribs/type', prettyValue: 'button'
    }]);

    // Test deep template, modify attribute named "type", which had been a problem.
    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 11, '<template id="deep2"><input type="text"/></template>'), [{
      op: 'replace', path: '/template#deep2/input/attribs/type', prettyValue: 'text'
    }]);

    // Test attributes -- add, replace, delete.
    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 6, '<div id="app" v-on:click="value"></div>'), [{
        op: 'add', path: '/div#app/attribs/v-on:click', prettyValue: 'value'
      }], 'I want you to add attribute v-on:click to tag div with id=app',
      [[this.replaceLine(oneStr, 6, '<div id="app" v-on:click=""></div>'),
        'On line 6, I expected "value" but found "".'],
        [this.replaceLine(oneStr, 6, '<div id="app" v-on:click="val"></div>'),
          'On line 6, I expected "value" but found "val".'],
        [this.replaceLine(oneStr, 6, '<div id="app">Hello</div>'),
          'You were supposed to add an attribute.'],
        [this.replaceLine(oneStr, 6, '<div id="app" wrong-attrib="value"></div>'),
          'You entered the wrong attribute name.'],
        [this.replaceLine(oneStr, 7, '<div v-on:click="value"></div>'),
          'You added the attribute to the wrong location.'],
      ]);

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 8, '<div id="sec" v-on:click="decrement"></div>'), [{
      op: 'replace', path: '/div#sec/attribs/v-on:click', prettyValue: 'decrement'
    }], 'I want you to change attribute v-on:click on tag div with id=sec');

    this.testChangeHtml(oneAst, this.replaceLine(oneStr, 8, '<div id="sec"></div>'), [{
      op: 'delete', path: '/div#sec/attribs/v-on:click', prettyValue: 'increment'
    }], 'I want you to remove attribute v-on:click from tag div with id=sec');
  }

  testJsExprs() {
    // Change a Literal to a BinaryExpression. This eventually uses collectObjectTypeChange.
    this.testChangeStrJS('let a = 1;', 'let a = 1 * 2;', [{
      op: 'replace', path: '/let a', prettyValue: 'let a = 1 * 2;'
    }], 'I want you to change let a');   // Kind of ugly expectPrompt

    // Same test, but inside a function.
    this.testChangeStrJS('function fun() { let a = 1; }', 'function fun() { let a = 1 * 2; }', [{
      op: 'replace', path: '/function fun/let a', prettyValue: 'let a = 1 * 2;'
    }], 'I want you to change let a in function fun');   // Kind of ugly expectPrompt

    // Change a value in a BinaryExpression.
    // this.testChangeStrJS('let a = 1 * 2;', 'let a = 1 * 3;', [{
    //   op: 'replace', path: '/let a/init', prettyValue: 'xxx'
    // }], 'I want you to add call on function fun to the beginning of the file');
  }

  //noinspection JSMethodCanBeStatic
  testComplexJsDiff() {
    let oneStr = `
function draw() {
  line(0, 0, 10, 10);
  line(0, 0, 20, 20);
}
class Bullet {
  draw() {
    rect(0, 0, 10, 10);
  }
}
class Empty {
}
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Test function calls.
    this.testChangeJS(oneAst, this.insertLine(oneStr, 0, 'fun();'), [{
      op: 'add', path: '/#first', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to the beginning of the file');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 1, 'fun();'), [{
      op: 'add', path: '/function draw/#first', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to the beginning of function draw');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 2, 'fun();'), [{
      op: 'add', path: '/function draw/#after line()', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to function draw, after the call on line()');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 3, 'fun();'), [{
      op: 'add', path: '/function draw/#last', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to the end of function draw');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 4, 'fun();'), [{
      op: 'add', path: '/#after function draw', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to after function draw');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 6, 'fun();'), [{
      op: 'add', path: '/class Bullet/method draw/#first', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to the beginning of method Bullet.draw');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 7, 'fun();'), [{
      op: 'add', path: '/class Bullet/method draw/#last', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to the end of method Bullet.draw');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 9, 'fun();'), [{
      op: 'add', path: '/#after class Bullet', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to after class Bullet');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 11, 'fun();'), [{
      op: 'add', path: '/#last', prettyValue: 'fun();'
    }], 'I want you to add call on function fun to the end of the file');

    // Test method definitions.
    this.testChangeJS(oneAst, this.insertLine(oneStr, 5, 'fun() {}'), [{
      op: 'add', path: '/class Bullet/#first', prettyValue: 'fun() {}'
    }], 'I want you to add method fun to the beginning of class Bullet');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 8, 'fun() {}'), [{
      op: 'add', path: '/class Bullet/#last', prettyValue: 'fun() {}'
    }], 'I want you to add method fun to the end of class Bullet');
    this.testChangeJS(oneAst, this.insertLine(oneStr, 10, 'fun() {}'), [{
      op: 'add', path: '/class Empty/#first', prettyValue: 'fun() {}'
    }], 'I want you to add method fun to the beginning of class Empty');

    // Test replace.
    this.testChangeJS(oneAst, this.replaceLines(oneStr, 0, 3, 'fun();'), [{
      op: 'replace', path: '/function draw', prettyValue: 'fun();'
    }], 'I want you to change function draw');
    this.testChangeJS(oneAst, this.replaceLines(oneStr, 1, 1, 'fun();'), [{
      op: 'replace', path: '/function draw/line()', prettyValue: 'fun();'
    }], 'I want you to change the call on line() in function draw');
    this.testChangeJS(oneAst, this.replaceLines(oneStr, 5, 7, 'fun() {}'), [{
      op: 'replace', path: '/class Bullet/method draw', prettyValue: 'fun() {}'
    }], 'I want you to change method Bullet.draw');
    this.testChangeJS(oneAst, this.replaceLines(oneStr, 4, 8, 'fun();'), [{
      op: 'replace', path: '/class Bullet', prettyValue: 'fun();'
    }], 'I want you to change class Bullet');

    // Test delete. Pretty similar to replace.
    this.testChangeJS(oneAst, this.deleteLines(oneStr, 0, 3), [{
      op: 'delete',
      path: '/function draw',
      prettyValue: 'function draw() {\n  line(0, 0, 10, 10);\n  line(0, 0, 20, 20);\n}'
    }], 'I want you to remove function draw');
    this.testChangeJS(oneAst, this.deleteLines(oneStr, 1, 1), [{
      op: 'delete', path: '/function draw/line()', prettyValue: 'line(0, 0, 10, 10);'
    }], 'I want you to remove the call on line() in function draw');
    this.testChangeJS(oneAst, this.deleteLines(oneStr, 5, 7), [{
      op: 'delete', path: '/class Bullet/method draw', prettyValue: 'draw() {\n  rect(0, 0, 10, 10);\n}'
    }], 'I want you to remove method Bullet.draw');
    this.testChangeJS(oneAst, this.deleteLines(oneStr, 4, 8), [{
      op: 'delete', path: '/class Bullet', prettyValue: 'class Bullet {\n  draw() {\n    rect(0, 0, 10, 10);\n  }\n}'
    }], 'I want you to remove class Bullet');

    // Multiple inserts at once.
    {
      // Insert in reverse order, back to front, to keep line numbers simple.
      let me = this;
      let twoStr = me.insertLine(oneStr, 3, 'fun3();');
      twoStr = me.insertLine(twoStr, 2, 'fun2();');
      twoStr = me.insertLine(twoStr, 1, 'fun1b();');
      twoStr = me.insertLine(twoStr, 1, 'fun1a();');
      let twoAst = parseAstJs(twoStr);

      let jsonPatches = compareAstJs(oneAst, twoAst);
      me.assertEqual(jsonPatches.length, 4);
      let jsonPatch = jsonPatches[0];
      me.assertEqual(jsonPatch.op, 'add');
      me.assertEqual(jsonPatch.path, '/function draw/#first');
      me.assertEqual(jsonPatch.prettyValue, 'fun1a();');
      jsonPatch = jsonPatches[1];
      me.assertEqual(jsonPatch.op, 'add');
      me.assertEqual(jsonPatch.path, '/function draw/#after fun1a()');
      me.assertEqual(jsonPatch.prettyValue, 'fun1b();');
      jsonPatch = jsonPatches[2];
      me.assertEqual(jsonPatch.op, 'add');
      me.assertEqual(jsonPatch.path, '/function draw/#after line()');
      me.assertEqual(jsonPatch.prettyValue, 'fun2();');
      jsonPatch = jsonPatches[3];
      me.assertEqual(jsonPatch.op, 'add');
      me.assertEqual(jsonPatch.path, '/function draw/#last');
      me.assertEqual(jsonPatch.prettyValue, 'fun3();');
    }
  }


  //noinspection JSMethodCanBeStatic
  testComplexJsDiffSmallerChanges() {
    let oneStr = `
function draw() {
  line(0, 0, 10, 10);
}
class Bullet {
  constructor() {
  }
  draw() {
    rect(0, 0, 10, 10);
    if(true) {}
  }
  update(t) {}
}
class Car {
  constructor(x) {
    this.x = x;
    this.update(1);
    if (cond) {
      fun();
    }
  }
}
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Add 1st param to function.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 0, 'function draw(x) {'), [{
      op: 'add',
      path: '/function draw/params/#first',
      prettyValue: 'x'
    }]);

    // Add 1st param to constructor.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 4, 'constructor(x) {'), [{
      op: 'add',
      path: '/class Bullet/constructor/params/#first',
      prettyValue: 'x'
    }]);

    // Add 1st param to method.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 6, '  draw(x) {'), [{
      op: 'add',
      path: '/class Bullet/method draw/params/#first',
      prettyValue: 'x'
    }]);

    // Delete if statement.
    this.testChangeJS(oneAst, this.deleteLines(oneStr, 8, 8), [{
      op: 'delete',
      path: '/class Bullet/method draw/if',
      prettyValue: 'if (true)\n  {}'
    }]);

    // Rename method parameter.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 10, '  update(time) {}'), [{
      op: 'replace',
      path: '/class Bullet/method update/params/t',
      prettyValue: 'time'
    }]);

    // Delete only line in constructor, was causing problems.
    this.testChangeJS(oneAst, this.deleteLines(oneStr, 14, 14), [{
      op: 'delete',
      path: '/class Car/constructor/this.x=',
      prettyValue: 'this.x = x;'
    }]);

    // Change function call in format: this.method    Fixes bug.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 15, '    this.update(2);'), [{
      op: 'replace',
      path: '/class Car/constructor/this.update()',
      prettyValue: 'this.update(2);'
    }]);

    // Test editing inside if-statement.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 17, '    prefun(); fun();'), [{
      op: 'add',
      path: '/class Car/constructor/if/#first',
      prettyValue: 'prefun();'
    }]);
  }

  testJsVariableDecls() {
    let oneStr = `
let name;
let arr = [1];
let arr2 = [1, 2, 3];
let arr3 = [1, [2, 3]];
let obj = { a: 1};
let obj2 = {
  data: {
    todos: []
  }
};
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Add number value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 0, "let name = 123;"), [{
      op: 'replace', path: '/let name', prettyValue: "let name = 123;"
    }]);

    // Add string value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 0, "let name = 'abc';"), [{
      op: 'replace', path: '/let name', prettyValue: "let name = 'abc';"
    }]);

    // Add array value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 0, "let name = [1, 2];"), [{
      op: 'replace', path: '/let name', prettyValue: "let name = [1, 2];"
    }]);

    // Add object value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 0, "let name = {a: 1};"), [{
      op: 'replace', path: '/let name', prettyValue: "let name = {a: 1};"
    }]);

    // Begin edits.

    // Add value to existing array.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 1, "let arr = [1, 2];"), [{
      op: 'replace', path: '/let arr', prettyValue: "let arr = [1, 2];"
    }]);

    // Modify value in existing array.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, "let arr2 = [1, 2, 4];"), [{
      op: 'replace', path: '/let arr2', prettyValue: "let arr2 = [1, 2, 4];"
    }]);

    // Modify value in existing array 2 levels deep.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 3, "let arr3 = [1, [2, 4]];"), [{
      op: 'replace', path: '/let arr3', prettyValue: "let arr3 = [1, [2, 4]];"
    }]);

    // Add value to existing object expression.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 4, "let obj = { a: 1, b: 2};"), [{
      op: 'replace', path: '/let obj', prettyValue: "let obj = { a: 1, b: 2};"
    }]);

    // Modify value in existing object expression.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 4, "let obj = { a: 2};"), [{
      op: 'replace', path: '/let obj', prettyValue: "let obj = { a: 2};"
    }]);

    // Modify nested data. Happened in vuejs tutorial.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 7, "todos: ['Hi']"), [{
      op: 'replace', path: '/let obj2', prettyValue: "let obj2 = {\n  data: {\ntodos: ['Hi']\n  }\n};"
    }]);
  }

  testVueComponentDiff() {
    let oneStr = `
Vue.component('comp', {
		template: '#comp-template'

});
Vue.component('comp2', {  // line 4
		template: '#comp2-template',
    data: function() { return{}; },
    methods: {}
});
Vue.component('comp3', {  // line 9
		template: '#comp2-template',
    data: function() { return {val: 2}; },
    methods: {
               method1: function() {}
              ,increment: function() {
                this.count += 1;
                this.$emit("update-counter", this.count);
               }
    }
});
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Change template name -- property value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 1, "template: '#comp-template2'"), [{
      op: 'replace',
      path: '/Vue.component#comp/arguments[1]/properties[template]/value',
      prettyValue: "'#comp-template2'"
    }], 'I want you to change value in attribute "template" in Vue component "comp"');

    // Add data section with empty function.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',data: function() {}'), [{
      op: 'add', path: '/Vue.component#comp/arguments[1]/properties/#last', prettyValue: "data: function() {}"
    }], 'I want you to add attribute "data" to the end of properties in Vue component "comp"');

    // Realistic test: add data with function, no value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',data: function() { return {}; }'), [{
      op: 'add',
      path: '/Vue.component#comp/arguments[1]/properties/#last',
      prettyValue: "data: function() { return {}; }"
    }]);

    // Realistic test: add data with function, with value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',data: function() { return {val: 1}; }'), [{
      op: 'add',
      path: '/Vue.component#comp/arguments[1]/properties/#last',
      prettyValue: "data: function() { return {val: 1}; }"
    }]);

    // Add data item to existing data function.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 6, "data: function() { return {val: 1}; },"), [{
      op: 'add',
      path: '/Vue.component#comp2/arguments[1]/properties[data]/return/properties/#first',
      prettyValue: "val: 1"
    }]);

    // // Modify data value.
    // this.testChangeJS(oneAst, this.replaceLine(oneStr, 11, "data: function() { return {val: 3}; },"), [{
    //   op: 'replace', path: '/Vue.component#comp3/arguments[1]/properties/property:data/return/properties/property:val/value', prettyValue: "3"
    // }]);

    // Delete data value.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 11, "data: function() { return {}; },"), [{
      op: 'delete',
      path: '/Vue.component#comp3/arguments[1]/properties[data]/return/properties[val]',
      prettyValue: "val: 2"
    }], 'I want you to remove attribute "val" in return in attribute "data" in Vue component "comp3"');

    // *** Methods ***
    // Add method section which is empty.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',methods: {}'), [{
      op: 'add', path: '/Vue.component#comp/arguments[1]/properties/#last', prettyValue: "methods: {}"
    }]);

    // Realistic test: add methods section with one method.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',methods: { increment: function() { console.log("hi"); } }'), [{
      op: 'add',
      path: '/Vue.component#comp/arguments[1]/properties/#last',
      prettyValue: "methods: { increment: function() { console.log(\"hi\"); } }"
    }]);

    // Add method to existing methods section.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 7, 'methods: { increment: function() { console.log("hi"); } }'), [{
      op: 'add',
      path: '/Vue.component#comp2/arguments[1]/properties[methods]/properties/#first',
      prettyValue: "increment: function() { console.log(\"hi\"); }"
    }]);

    // Change method -- add a statement to an empty method.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 13, 'method1: function() { this.data += 1; }'), [{
      op: 'add',
      path: '/Vue.component#comp3/arguments[1]/properties[methods]/properties[method1]/#first',
      prettyValue: "this.data += 1;"
    }], 'I want you to add assignment to this.data to the beginning of method method1 in Vue component "comp3"');

    // Change method -- add a statement (a call on an object).
    this.testChangeJS(oneAst, this.insertLine(oneStr, 15, 'this.todos.push(123);'), [{
      op: 'add',
      path: '/Vue.component#comp3/arguments[1]/properties[methods]/properties[increment]/#first',
      prettyValue: "this.todos.push(123);"
    }], 'I want you to add call on this.todos.push() to the beginning of method increment in Vue component "comp3"');

    // Change method -- edit existing statement.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 16, 'this.$emit("update-counter", 1);'), [{
      op: 'replace',
      path: '/Vue.component#comp3/arguments[1]/properties[methods]/properties[increment]/this.$emit()',
      prettyValue: 'this.$emit("update-counter", 1);'
    }], 'I want you to change the call on this.$emit() in method increment in Vue component "comp3"');
  }

  testVueDefinitionDiff() {
    let oneStr = `
let vm = new Vue({
    el: "#app"

});
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Add empty data.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',data: {}'), [{
      op: 'add', path: '/let vm/init/arguments[0]/properties/#last', prettyValue: "data: {}"
    }], 'I want you to add attribute "data" to the end of properties in Vue declaration');

    // Add data with item.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 2, ',data: { total: 0 }'), [{
      // op: 'add', path: '/let vm/new Vue/arguments[0]/properties/#last', prettyValue: "data: { total: 0 }"
      op: 'add', path: '/let vm/init/arguments[0]/properties/#last', prettyValue: "data: { total: 0 }"
    }], 'I want you to add attribute "data" to the end of properties in Vue declaration');
  }

  testVueDefinitionDiffChangeExisting() {
    let oneStr = `
let vm = new Vue({
   el: "#app"
  ,data: {
    todos: []
   ,list: ["My item"]
   ,listobjs: [{title: "Title"}]
  }
});
`.trim();
    let oneAst = parseAstJs(oneStr);

    // Add empty data.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 3, '  todos: ["My item"]'), [{
      op: 'add', path: '/let vm/init/arguments[0]/properties[data]/properties[todos]/elements/#first', prettyValue: '"My item"'
    }], 'I want you to add string to the beginning of elements in attribute "todos" in attribute "data" in Vue declaration');

    // Remote string from list.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 4, '  ,list: []'), [{
      op: 'delete', path: '/let vm/init/arguments[0]/properties[data]/properties[list]/elements[0]', prettyValue: '"My item"'
    }], 'I want you to remove array element #0 in attribute "list" in attribute "data" in Vue declaration');

    // Add attribute to object inside list.
    this.testChangeJS(oneAst, this.replaceLine(oneStr, 5, '  ,listobjs: [{title: "Title", complete: true}]'), [{
      op: 'add', path: '/let vm/init/arguments[0]/properties[data]/properties[listobjs]/elements[0]/properties/#last', prettyValue: 'complete: true'
    }], 'I want you to add attribute "complete" to the end of properties in array element #0 in attribute "listobjs" in attribute "data" in Vue declaration');
  }


  private testChangeJS(origAst, twoStr, expectPatches, expectPrompt?: string) {
    // Test we get the right patch.
    let twoAst = parseAstJs(twoStr);
    // console.log('DEBUG.testChange', origAst, twoAst);
    let jsonPatches = compareAstJs(origAst, twoAst);
    assertDeepEqual(cleanCopyPatches(jsonPatches), expectPatches);

    // Test applying new patch to old AST gets desired output.
    let langAdapter = getLangAdapter('js');
    let tmpAst = langAdapter.copyAstStripLoc(origAst);
    applyJsonPatches(langAdapter, tmpAst, cleanCopyPatches(jsonPatches));  // call cleanCopyPatches to test re-parsing of patches
    let computedDelta = compareAstJs(tmpAst, twoAst);
    this.assertEqual(computedDelta.length, 0);

    // Test generating code from ast. Used to have a bug where ' became " after generating.
    // Sorry, can't test this, because of testLittleJsThings().
    // let contents = langAdapter.printAst(tmpAst);
    // this.assertEqual(contents, twoStr);

    let authorDelta = makeFakeDeltaJs(cleanCopyPatches(jsonPatches));  // Make clean copy of patches, to simulate how play works.
    if (expectPrompt) {
      // Test auto-prompt.
      let prompt: string[] = getAutoPromptForDelta(authorDelta);
      this.assertEqual(prompt[0], expectPrompt);
    }
  }

  private testChangeStrJS(oneStr, twoStr, expectPatches, expectPrompt?: string) {
    let oneAst = parseAstJs(oneStr);
    return this.testChangeJS(oneAst, twoStr, expectPatches, expectPrompt);
  }

  private testChangeHtml(origAst, twoStr, expectPatches, expectPrompt?: string, checkChanges?) {
    // Test we get the right patch.
    let twoAst = parseAstHtml(twoStr);
    // console.log('DEBUG.testChange', origAst, twoAst);
    let jsonPatches = compareAstHtml(origAst, twoAst);
    assertDeepEqual(cleanCopyPatches(jsonPatches), expectPatches);

    // Test applying new patch to old AST gets desired output.
    let tmpAst = deepCopy(origAst);
    applyJsonPatches(getLangAdapter('html'), tmpAst, cleanCopyPatches(jsonPatches));  // call cleanCopyPatches to test re-parsing of patches
    let computedDelta = compareAstHtml(tmpAst, twoAst);
    this.assertEqual(computedDelta.length, 0);

    let authorDelta = makeFakeDeltaHtml(cleanCopyPatches(jsonPatches));  // Make clean copy of patches, to simulate how play works.
    if (expectPrompt) {
      // Test auto-prompt.
      let prompt: string[] = getAutoPromptForDelta(authorDelta);
      this.assertEqual(prompt[0], expectPrompt);
    }

    if (checkChanges) {
      let driverStep: IAuthorStep = {description: 'dummy', delta: authorDelta};
      for (let checkChange of checkChanges) {
        let [newStr, expectChange] = checkChange;
        let userAst = parseAstHtml(newStr);
        let userJsonPatches = compareAstHtml(origAst, userAst);
        let userDelta = makeFakeDeltaHtml(userJsonPatches);
        let userStep = <IStep>{delta: userDelta};
        let wrongChange: IWrongChange = giveFeedbackOnDelta(driverStep, userStep);
        this.assertEqual(wrongChange.getFeedbackStr(), expectChange);
      }
    }
  }

  private testChangeJson(origAst, twoStr, expectPatches) {
    // Test we get the right patch.
    let twoAst = JSON.parse(twoStr);
    // console.log('DEBUG.testChange', origAst, twoAst);
    let jsonPatches = compareAstJson(origAst, twoAst);
    assertDeepEqual(cleanCopyPatches(jsonPatches), expectPatches);

    // Test applying new patch to old AST gets desired output.
    let tmpAst = deepCopy(origAst);
    applyJsonPatches(getLangAdapter('json'), tmpAst, cleanCopyPatches(jsonPatches));  // call cleanCopyPatches to test re-parsing of patches
    let computedDelta = compareAstJson(tmpAst, twoAst);
    this.assertEqual(computedDelta.length, 0);
  }

  // Test round-trip is consistent.
  private testParsePrint(str: string, strBecomesAfterPrint?: string) {
    let ast = parseAstHtml(str);
    let printFromAst = prettyPrintAstHtml(ast);
    this.assertEqual(strBecomesAfterPrint ? strBecomesAfterPrint : str, printFromAst);
  }

  //noinspection JSMethodCanBeStatic
  private insertLine(origStr: string, lineNumber: number, strToInsert: string): string {
    let lines = origStr.split('\n');
    lines.splice(lineNumber, 0, strToInsert);
    return lines.join('\n');
  }

  //noinspection JSMethodCanBeStatic
  private replaceLine(origStr: string, lineNumber, strToInsert) {
    let lines = origStr.split('\n');
    lines.splice(lineNumber, 1, strToInsert);
    return lines.join('\n');
  }

  //noinspection JSMethodCanBeStatic
  private replaceLines(origStr: string, startLineNumber, endLineNumber, strToInsert) {
    let lines = origStr.split('\n');
    lines.splice(startLineNumber, endLineNumber - startLineNumber + 1, strToInsert);
    return lines.join('\n');
  }

  //noinspection JSMethodCanBeStatic
  private deleteLines(origStr: string, startLineNumber: number, endLineNumber: number): string {
    let lines = origStr.split('\n');
    let numLinesToDelete = endLineNumber - startLineNumber + 1;
    lines.splice(startLineNumber, numLinesToDelete);
    return lines.join('\n');
  }

  //noinspection JSMethodCanBeStatic
  testSimpleJsDiff() {
    {
      let oneStr = `
class Bullet {
  draw() {
    rect(0, 0, 10, 10);
  }
}
`.trim();
      let oneAst = parseAstJs(oneStr);

      let twoStr = `
class Bullet {
  draw() {
    rect(0, 0, 10, 10);
    ellipse(0, 0, 5, 5);
  }
}
`.trim();
      let twoAst = parseAstJs(twoStr);
      let jsonPatches = compareAstJs(oneAst, twoAst);
      applyJsonPatches(getLangAdapter('js'), oneAst, jsonPatches);
      let oneStrPatched = prettyPrintAstJs(oneAst);

      this.assertEqual(twoStr, oneStrPatched);
    }

    // Do simple test.
    {
      let oneStr = 'fn(1)';
      let oneAst = parseAstJs(oneStr);
      // let twoStr = 'fn(1, 2)';
      let twoStr = 'fn(1); go(2);';
      let twoAst = parseAstJs(twoStr);
      /*let jsonPatches =*/
      compareAstJs(oneAst, twoAst);
      // console.log('Json Patch: ', jsonPatches);
    }

  }

  testJsonDiff() {
    let oneStr = `
[
{"id": 1, "title": "Yo"},
{"id": 2, "title": "Ho"},
{"id": 3, "title": "Low",
   "children": [
     {"id": 4, "title": "Blow"}
   ]
}
]
`.trim();
    let oneAst = JSON.parse(oneStr);

    // Test insert /#first.
    this.testChangeJson(oneAst, this.replaceLine(oneStr, 0, '[{"id": 10, "title": "Hey"},'), [{
      op: 'add', path: '/#first', prettyValue: {"id": 10, "title": "Hey"}
    }]);

    // Test insert /#last.
    this.testChangeJson(oneAst, this.replaceLine(oneStr, 8, ',{"id": 10, "title": "Hey"}]'), [{
      op: 'add', path: '/#last', prettyValue: {"id": 10, "title": "Hey"}
    }]);

    // Test insert /#after.
    this.testChangeJson(oneAst, this.insertLine(oneStr, 2, '{"id": 10, "title": "Hey"},'), [{
      op: 'add', path: '/#after id=1', prettyValue: {"id": 10, "title": "Hey"}
    }]);

    // Test delete.
    this.testChangeJson(oneAst, this.deleteLines(oneStr, 1, 1), [{
      op: 'delete', path: '/id=1', prettyValue: {"id": 1, "title": "Yo"}
    }]);

    // Test change title.
    this.testChangeJson(oneAst, this.replaceLine(oneStr, 1, '{"id": 1, "title": "Yo-ho"},'), [{
      op: 'replace', path: '/id=1/title', prettyValue: "Yo-ho"
    }]);

    // Test add child.
    this.testChangeJson(oneAst, this.replaceLine(oneStr, 2, '{"id": 2, "title": "Ho", "children": [{"id": 10, "title": "Hey"}]},'), [{
      op: 'add', path: '/id=2/children', prettyValue: [{"id": 10, "title": "Hey"}]
    }]);

    // Test add second child.
    this.testChangeJson(oneAst, this.insertLine(oneStr, 6, ',{"id": 10, "title": "Hey"}'), [{
      op: 'add', path: '/id=3/children/#last', prettyValue: {"id": 10, "title": "Hey"}
    }]);

    // Test add grandchild.
    this.testChangeJson(oneAst, this.replaceLine(oneStr, 5, '{"id": 4, "title": "Blow", "children": [{"id": 10, "title": "Hey"}]}'), [{
      op: 'add', path: '/id=4/children', prettyValue: [{"id": 10, "title": "Hey"}]
    }]);
  }

  ngOnInit() {
  }

  //noinspection JSMethodCanBeStatic
  private assertEqual(val1, val2) {
    if (val1 === val2) {
      // Good.
    } else {
      console.error('assertEqual failure: ', val1, ' vs. ', val2);
      throw new Error('assertEqual failure: ' + val1 + ' vs. ' + val2);
    }
  }
}
