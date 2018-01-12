import {Component, OnInit} from '@angular/core';
import {ProjectService} from "../project.service";
import {ActivatedRoute, Params} from "@angular/router";
import {SkillTreeService} from "../skill-tree.service";

@Component({
  selector: 'app-my-skills-page',
  template: `
    <h1>Skill Tree</h1>
    <div *ngIf="myskills">
      <app-skill-tree [myskills]="myskills"></app-skill-tree>
    </div>
  `,
  styles: []
})
export class MySkillsPageComponent implements OnInit {
  myskills: any;

  constructor(private route: ActivatedRoute, private skillTreeService: SkillTreeService) {
  }

  ngOnInit() {
    this.route.params.subscribe((params: Params) => {
      this.skillTreeService.getMySkills().then(myskills => {
        this.myskills = myskills;
      });
    });
  }

}
