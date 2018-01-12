import {Routes, RouterModule} from '@angular/router';
import {AdminHomePageComponent} from "./admin-home-page/admin-home-page.component";
import {ModuleWithProviders} from '@angular/core';
import {TestAstPageComponent} from "./project/test-ast-page/test-ast-page.component";
import {PlayStepPageComponent} from "./project/play-step-page/play-step-page.component";
import {EventPageComponent} from "./project/event-page/event-page.component";
import {NotFoundPageComponent} from "./common/not-found-page/not-found-page.component";
import {LoginPageComponent} from "./common/login-page/login-page.component";
import {HomePageComponent} from "./home-page/home-page.component";
import {
  AuthorStepPageComponent,
  AuthorStepPageComponentPendingChangesGuard
} from "./author/author-step-page/author-step-page.component";
import {AuthorEditPageComponent} from "./author/author-edit-page/author-edit-page.component";
import {LoggedInGuard} from "./common/logged-in.guard";
import {MySkillsPageComponent} from "./project/my-skills-page/my-skills-page.component";
import {RemoteHomePageComponent} from "./remote-home-page/remote-home-page.component";
import {HelpPageComponent} from "./common/help-page/help-page.component";
import {RemoteAuthorPageComponent} from "./admin/remote-author-page/remote-author-page.component";
import {RemoteAuthorDetailPageComponent} from "./admin/remote-author-detail-page/remote-author-detail-page.component";

// All routes need guards except for: login, home, and error pages at end.
const appRoutes: Routes = [
  // Basic stuff.
  {path: 'login', component: LoginPageComponent},
  {path: '', pathMatch: 'full', component: RemoteHomePageComponent},
  {path: 'help', pathMatch: 'full', component: HelpPageComponent},
  {path: 'mobile', pathMatch: 'full', component: HomePageComponent},
  // Running tutorials/project support.
  {path: 'play/:projectId/step/:stepNum', component: PlayStepPageComponent, canActivate: [LoggedInGuard]},
  {path: 'myskills', component: MySkillsPageComponent, canActivate: [LoggedInGuard]},
  // Project authoring.
  {path: 'author/:projectId/edit', component: AuthorEditPageComponent, canActivate: [LoggedInGuard]},
  {
    path: 'author/:projectId/step/:stepNum',
    component: AuthorStepPageComponent,
    canActivate: [LoggedInGuard],
    canDeactivate: [AuthorStepPageComponentPendingChangesGuard]
  },
  // Admin or testing.
  {path: 'admin', component: AdminHomePageComponent, canActivate: [LoggedInGuard]},
  {path: 'admin/remote_author', component: RemoteAuthorPageComponent, canActivate: [LoggedInGuard]},
  {path: 'admin/remote_author/:projectTitle', component: RemoteAuthorDetailPageComponent, canActivate: [LoggedInGuard]},
  {path: 'event', component: EventPageComponent, canActivate: [LoggedInGuard]},
  {path: 'project/testast', component: TestAstPageComponent, canActivate: [LoggedInGuard]},
  // Error handling.
  {path: '404', component: NotFoundPageComponent},
  // Catchall at end: don't redirect if not found, that way we can display the wrong route.
  {path: '**', component: NotFoundPageComponent}
];

export const routing: ModuleWithProviders = RouterModule.forRoot(appRoutes);

export const routedComponents = [];
