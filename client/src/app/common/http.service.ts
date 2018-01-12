import {Injectable} from '@angular/core';
import {Http} from '@angular/http';

@Injectable()
export class HttpService {

  constructor(private http: Http) {
  }

  get(url) {
    return this.http
      .get(url)
      .toPromise()
      .then(response => {
        return response.json();
      })
      .catch(this.handleError);
  }

  post(url, body) {
    return this.http
      .post(url, JSON.stringify(body))  // Default angular2 http service wastes space with: JSON.stringify(this._body, null, 2)
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

}
