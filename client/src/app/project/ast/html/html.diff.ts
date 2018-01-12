// // Custom diff for html. We need to ignore text and comment nodes sometimes.
// import {isEmptyOrFalse, isArray, intrinsicTypes} from "../utils";
// import {WrongChange} from "../astcmp";
//
// function compareAstHtmlRec(oldAst, newAst, out, inAttribs): void {
//   if (isEmptyOrFalse(oldAst)) {
//     // Case: Old is empty.
//     if (isEmptyOrFalse(newAst)) {
//       // Both empty, good.
//       return;
//     } else {
//       out.push(new WrongChange(oldAst, newAst, 'simple-value-diff'));
//     }
//   } else if (isArray(oldAst)) {
//     // Case: Array.
//     if (oldAst.length !== newAst.length) {
//       out.push(new WrongChange(oldAst, newAst, 'wrong-array-length'));
//       return;  //TODOfuture
//     }
//     for (let i = 0, l = oldAst.length; i < l; ++i) {
//       compareAstHtmlRec(oldAst[i], newAst[i], out, false);
//       // if (result) {
//       //   return result.updateStack(i, newAst[i]);  // Important to updateStack on way up + out.
//       // }
//     }
//   } else if (intrinsicTypes.indexOf(oldAst.constructor) >= 0) {
//     // Case: Simple type.
//     if (oldAst !== newAst) {
//       out.push(new WrongChange(oldAst, newAst, 'simple-value-diff'));
//     }
//   } else {
//     // Case: Object.
//     let names;
//     if (inAttribs) {
//       // Look at all fields in both.
//       let index = {};
//       Object.keys(oldAst).forEach(key => index[key] = key);
//       Object.keys(newAst).forEach(key => index[key] = key);
//       names = Object.keys(index);
//     } else {
//       names = ['name', 'type', 'attribs', 'children', 'data'];
//     }
//     for (let index = 0, nameCount = names.length; index < nameCount; ++index) {
//       let name = names[index];
//       let oldVal = oldAst[name];
//       let newVal = newAst[name];
//       compareAstHtmlRec(oldVal, newVal, out, name === 'attribs');
//       // if (result) {
//       //   return result.updateStack(name, newVal);  // Important to updateStack on way up + out.
//       // }
//     }
//   }
// }
//
// // Return list of diffs.
// // PROBLEMS: stack of changes missing, not ignore white space, not smart about array diffing.
// export function NOTREADY_compareAstHtml(oldAst, newAst) {
//   let out = [];
//   compareAstHtmlRec(oldAst, newAst, out, false);
//   return out
// }
