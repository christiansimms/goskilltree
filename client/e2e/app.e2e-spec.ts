import { TutorPage } from './app.po';

describe('tutor App', function() {
  let page: TutorPage;

  beforeEach(() => {
    page = new TutorPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
