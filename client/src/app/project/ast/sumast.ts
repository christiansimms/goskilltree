import {IJsonPatch, getAstOnPatch} from "./astdiff";
import * as recast from 'recast';
import {getLangAdapter} from "./utils";

export class AstStat {
  private counts;

  constructor() {
    this.counts = {};
  }

  updateStats(patch: IJsonPatch) {
    let langAdapter = getLangAdapter('js');
    let ast = getAstOnPatch(langAdapter, patch);
    let me = this;
    //noinspection JSUnusedGlobalSymbols
    recast.visit(ast, {  // NOTE: recast.visit has side effect of creating some null field values.
      visitNode: function (path) {
        let node = path.node;
        let type = node.type;
        me.counts[type] = !me.counts[type] ? 1 : (me.counts[type] + 1);
        this.traverse(path);
      }
    });
  }

  getSummary() {
    return this.counts;
  }
}
