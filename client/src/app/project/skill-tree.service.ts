import {Injectable} from '@angular/core';
import {IProject, ProjectService} from "./project.service";
import {FileEntry, FileSystemFindFile} from "./ast/utils";
import {collectCompleteSkills} from "./project-plan";



@Injectable()
export class SkillTreeService {

  constructor(private projectService: ProjectService) {
  }

  getMySkills() {
    return this.projectService.getRemoteProjectsComplete().then((projects: IProject[]) => {
      let skillIndex = {};
      for (let project of projects) {
        let fs = project.latest_file_system;
        let entry: FileEntry = FileSystemFindFile(fs, 'db/todo.json');
        // console.log('Looking at project plan: ', entry);
        collectCompleteSkills(entry.contents, skillIndex);
      }
      return skillIndex;
      // return {'/p5/rect': 1};
    });
  }
}
