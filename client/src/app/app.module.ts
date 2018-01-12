import {BrowserModule} from '@angular/platform-browser';
import {APP_INITIALIZER, NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HttpModule} from '@angular/http';
import {routedComponents, routing} from "./app.routing";

import {AppComponent} from './app.component';
import {AdminHomePageComponent, OnlyRealStepPipe} from './admin-home-page/admin-home-page.component';
import {ProjectService} from "./project/project.service";
import {CodeMirrorEditorComponent} from './project/code-mirror-editor/code-mirror-editor.component';
import {CMFileEditorComponent, AllButJsonFiles} from "./project/cmfile-editor/cmfile-editor.component";
import {TestAstPageComponent} from './project/test-ast-page/test-ast-page.component';
import {PlayStepPageComponent, NoProjectPlanStep} from './project/play-step-page/play-step-page.component';
import {SimpleMDEComponentComponent} from './project/simple-mdecomponent/simple-mdecomponent.component';
import {EventPageComponent} from './project/event-page/event-page.component';
import {NotFoundPageComponent} from './common/not-found-page/not-found-page.component';
import {AuthService} from "./common/auth.service";
import {LoginPageComponent} from './common/login-page/login-page.component';
import {SafePipe, SmartJson} from "./common/display-helper";
import {HomePageComponent} from './home-page/home-page.component';
import {EventService} from "./project/event.service";
import {AuthorService} from "./author/author.service";
import {
  AuthorStepPageComponent,
  AuthorStepPageComponentPendingChangesGuard
} from './author/author-step-page/author-step-page.component';
import {AuthorEditPageComponent} from './author/author-edit-page/author-edit-page.component';
import {PersistService} from "./persist.service";
import {HttpService} from "./common/http.service";
import {TodoTreeComponent} from './project/todo-tree/todo-tree.component';
import {LoggedInGuard} from "./common/logged-in.guard";
import { FlashComponent } from './common/flash/flash.component';
import {FlashService} from "./common/flash.service";
import { MySkillsPageComponent } from './project/my-skills-page/my-skills-page.component';
import { SkillTreeComponent } from './common/skill-tree/skill-tree.component';
import { ReferenceLibraryComponent } from './common/reference-library/reference-library.component';
import { AuthorSummaryProjectPlanComponent } from './author/author-summary-project-plan/author-summary-project-plan.component';
import { AuthorSummaryPlanTreeComponent } from './author/author-summary-plan-tree/author-summary-plan-tree.component';
import { AuthorSummaryProjectTableComponent } from './author/author-summary-project-table/author-summary-project-table.component';
import { RemoteHomePageComponent } from './remote-home-page/remote-home-page.component';
import {PlayService} from "./project/play.service";
import {SkillTreeService} from "./project/skill-tree.service";
import { ProjectTreeComponent } from './common/project-tree/project-tree.component';
import {ProjectTreeService} from "./common/project-tree.service";
import { HelpPageComponent } from './common/help-page/help-page.component';
import { SimpleCodeMirrorEditorComponent } from './project/simple-code-mirror-editor/simple-code-mirror-editor.component';
import { RemoteAuthorPageComponent } from './admin/remote-author-page/remote-author-page.component';
import { RemoteAuthorDetailPageComponent } from './admin/remote-author-detail-page/remote-author-detail-page.component';


export function useFactoryFunction(authService: AuthService) {
  return function factoryFunction() {
    return authService.firstTimeFetchCurrentUser();
  };
}

@NgModule({
  declarations: [
    AppComponent,
    routedComponents,
    AdminHomePageComponent,
    CodeMirrorEditorComponent,
    CMFileEditorComponent,
    OnlyRealStepPipe,
    NoProjectPlanStep,
    TestAstPageComponent,
    PlayStepPageComponent,
    SimpleMDEComponentComponent,
    EventPageComponent,
    NotFoundPageComponent,
    LoginPageComponent,
    SafePipe,
    SmartJson,
    AllButJsonFiles,
    HomePageComponent,
    AuthorStepPageComponent,
    AuthorEditPageComponent,
    TodoTreeComponent,
    FlashComponent,
    MySkillsPageComponent,
    SkillTreeComponent,
    ReferenceLibraryComponent,
    AuthorSummaryProjectPlanComponent,
    AuthorSummaryPlanTreeComponent,
    AuthorSummaryProjectTableComponent,
    RemoteHomePageComponent,
    ProjectTreeComponent,
    HelpPageComponent,
    SimpleCodeMirrorEditorComponent,
    RemoteAuthorPageComponent,
    RemoteAuthorDetailPageComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpModule,
    routing,
  ],
  providers: [
    AuthorStepPageComponentPendingChangesGuard,
    AuthService,
    AuthorService,
    EventService,
    FlashService,
    HttpService,
    LoggedInGuard,
    PlayService,
    ProjectService,
    ProjectTreeService,
    PersistService,
    SkillTreeService,
    {
      provide: APP_INITIALIZER,
      useFactory: useFactoryFunction,
      deps: [AuthService/*, Http*/],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
}
