import {IJsonPatch} from "../ast/astdiff";
import {parsePatchAstJs} from "../ast/js/js.parse";


// TODOfuture Put these templates into db?
export const plnkr_blank_template_json =
[
    {
        "contents": "<!DOCTYPE html>\n<html>\n<head>\n</head>\n<body>\n<script src=\"app.js\"></script>\n</body>\n</html>\n",
        "name": "index.html"
    },
    {
        "contents": "",
        "name": "app.js"
    }
]
;


export const plnkr_p5js_template_json =
    [
      {
        "contents": "<!DOCTYPE html>\n<html>\n  <head>\n    <script src=\"https://cdnjs.cloudflare.com/ajax/libs/p5.js/0.5.5/p5.min.js\"></script>\n    <script src=\"sketch.js\"></script>\n    <style>canvas { border:1px solid black; }</style>\n  </head>\n  <body>\n    <div id=\"canvasContainer\"></div>\n  </body>\n</html>\n",
        "name": "index.html"
      },
      {
        "contents": "function draw() {\n}\n",
        "name": "sketch.js"
      }
    ]
  ;

// TODOfuture for this case: make sure index.html is first, or authoring code has problems. Is this still a problem?
export const plnkr_vuejs_template_json =
    [
      {
        "contents": "<!DOCTYPE html>\n<html>\n<head>\n    <script src=\"https://unpkg.com/vue/dist/vue.js\"></script>\n</head>\n<body>\n<div id=\"app\"></div>\n<script src=\"app.js\"></script>\n</body>\n</html>\n",
        "name": "index.html"
      },
      {
        "contents": "let vm = new Vue({\n    el: \"#app\"\n});\n",
        "name": "app.js"
      }
    ]
  ;
