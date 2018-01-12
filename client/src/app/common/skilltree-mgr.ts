import {IAuthorStep, IDeltaEntry, IAuthorProject} from "../author/author.service";
import {IJsonPatch, getAstOnPatch} from "../project/ast/astdiff";
import {getLangAdapterFromFilename} from "../project/ast/utils";
import {skilltree} from "./skilltree";
import {visitAst} from "../project/ast/astcmp";


function visitSkillTreeRec(children, fn) {
  children.forEach(child => {
    fn(child);
    if (child.children) {
      visitSkillTreeRec(child.children, fn);
    }
  });
}

function visitSkillTree(fn) {
  visitSkillTreeRec(skilltree.children, fn);
}

function computeFullId(child, parent) {
  let path = parent ? parent.id : '';
  path = path + child.name;
  return path;
}


export function getFullSkillTree() {  // TODOfuture: not yet called
  let nodes = [];
  let edges = [];

  function addChildrenRec(parent, children) {
    children.forEach(child => {

      // Define node.
      let node = {
        id: computeFullId(child, parent),
        label: child.name
      };
      nodes.push(node);

      // Define edge.
      if (parent) {
        edges.push({from: parent.id, to: node.id});
      }

      // Recurse.
      if (child.children) {
        addChildrenRec(node, child.children);
      }
    });
  }

  addChildrenRec(null, skilltree.children);  // Cannot use visitSkillTree, since we need the parent during recursion.

  return {nodes: nodes, edges: edges};
}

export function getSkillTree(skillIndex) {
  let nodes = [];
  let edges = [];

  visitSkillTree(skill => {
    if (skillIndex[skill.id]) {
      let node = {
        id: computeFullId(skill, parent),
        label: skill.name
      };
      nodes.push(node);
    }
  });

  return {nodes: nodes, edges: edges};
}


function findP5SkillByFunctionName(functionName) {
  let out = [];
  visitSkillTree(skill => {
    if (skill.name === functionName && !skill.children) {
      out.push(skill);
    }
  });
  return out;
}

// Return list of skill objects possibly relevant for given IAuthorStep change.
export function suggestSkills(project: IAuthorProject, step: IAuthorStep): any {
  let out = [];
  step.delta.forEach((deltaEntry: IDeltaEntry) => {
    const langAdapter = getLangAdapterFromFilename(deltaEntry.filename);
    deltaEntry.diffs.forEach((patch: IJsonPatch) => {
      let ast = getAstOnPatch(langAdapter, patch);
      if (project.template === 'p5js') {
        visitAst(langAdapter, ast, obj => {
          if (obj.type === 'Identifier' && obj.name) {
            let idName = obj.name;
            let skills = findP5SkillByFunctionName(idName);
            out.push(...skills);  // Use the new spread operator.
          }
          if (obj.type === 'FunctionDeclaration') {
            // out.push('/Imperative/Define Function');
            let skills = findP5SkillByFunctionName("Define Function");
            out.push(...skills);  // Use the new spread operator.
          }
        });
      } else {
        out.push('Cannot handle this template, its not p5');
      }
    });
  });
  return out;
}
