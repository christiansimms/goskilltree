import {
  Pipe,
  PipeTransform,
} from '@angular/core';
import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';
import {isString} from "./type-helper";


@Pipe({name: 'safeUrl'})
export class SafePipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {
  }

  transform(url): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}


@Pipe({name: 'smartJson'})
export class SmartJson implements PipeTransform {
  transform(value: any): string {
    if (isString(value)) {
      return value;
    } else {
      return JSON.stringify(value, null, 2);
    }
  }
}
