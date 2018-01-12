import {Component, ElementRef, Input, OnInit} from '@angular/core';
import {getSkillTree} from "../skilltree-mgr";

declare let vis: any;


@Component({
  selector: 'app-skill-tree',
  template: ``,  // empty template!
  styles: [':host /deep/ .vis-network { width: 100%; height: 600px !important; border: 1px solid lightgray; }']
})
export class SkillTreeComponent implements OnInit {

  @Input() myskills: any;

  constructor(private element: ElementRef) {
  }

  ngOnInit() {
    // console.log('DEBUG SkillTreeComponent myskills: ', this.myskills);
    let options = {
      layout: {
        hierarchical: {
          direction: "UD",
          sortMethod: 'directed'  // Otherwise you don't get clean hierarchy.
        }
      },
      edges: {
        // smooth: true,
        arrows: {to: true}
      }
    };
    let data = getSkillTree(this.myskills);
    //noinspection JSUnusedLocalSymbols
    let network = new vis.Network(this.element.nativeElement, data, options);
  }

}
