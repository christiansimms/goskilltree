import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {AuthorService} from "../../author/author.service";
import {Headers, Http, RequestOptions} from '@angular/http';
import {FlashService} from "../../common/flash.service";

@Component({
  selector: 'app-remote-author-detail-page',
  templateUrl: './remote-author-detail-page.component.html',
  styles: []
})
export class RemoteAuthorDetailPageComponent implements OnInit {

  projectTitle: string;
  remoteProjects: any;

  constructor(private route: ActivatedRoute, private authorService: AuthorService, private http: Http, private flashService: FlashService) {
  }

  ngOnInit() {
    this.route.params.subscribe((params: Params) => {
      this.projectTitle = params['projectTitle'];
      this.loadData();
    });
  }

  loadData() {
    this.authorService.getRemoteProjectsComplete().then(projects => {
      // TODO: filter on server side.
      this.remoteProjects = projects.filter(project => project.title === this.projectTitle);
    });
  }

  showStepsInfo(steps) {
    return JSON.stringify(steps).length;
  }

  fileSelected(event): void {
    const fileList: FileList = event.target.files;
    if (fileList.length > 0) {
      const file = fileList[0];
      // noinspection JSIgnoredPromiseFromCall
      // this.authorService.uploadNewVersion(this.projectTitle, file);  TODO
      this.uploadNewVersion(this.projectTitle, file).then(() => {
        this.flashService.tellSuccessImmediately('Version uploaded');
        this.loadData();
      });
    }
  }

  // This could should be in AuthorService, but then you have to play with this.http.post, which is calling
  // Angular service directly, since I copied code and didn't want to change it.  - 2018-01-02
  uploadNewVersion(projectTitle: string, file: File) {

    let formData = new FormData();
    formData.append('uploadFile', file, file.name);

    let headers = new Headers();
    /** No need to include Content-Type in Angular 4 */
    // headers.append('Content-Type', 'multipart/form-data');
    headers.append('Accept', 'application/json');
    let options = new RequestOptions({headers: headers});
    return this.http.post('/api/data/authorproject_by_title/' + projectTitle, formData, options)
      .toPromise()
      .then(response => {
        return response.json();
      })
      .catch(this.handleError);
  }

  //noinspection JSMethodCanBeStatic
  private handleError(error: any): Promise<any> {
    console.error('An error occurred', error);
    return Promise.reject(error.message || error);
  }

  downloadAuthorProject(projectId) {
    return this.authorService.getRemoteProjectStrippedForDownload(projectId).then((authorProject) => {
      let text = JSON.stringify(authorProject, null, 2);
      let base64Encoded = btoa(text);
      let uri = 'data:application/json;charset=utf-8;base64,' + base64Encoded;
      let link = document.createElement("a");
      link.href = uri;
      (link as any).style = "visibility:hidden";
      let fileName = authorProject.title + '-v' + authorProject.version;
      link.download = fileName + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

}

