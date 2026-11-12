import { collapsibleGroup } from '../collapsibleGroup';

describe('collapsibleGroup', () => {
  it('starts collapsed with its toggle', () => {
    expect(collapsibleGroup(false)).toEqual({ expanded: false, toggleable: true });
  });

  it('opens and closes with its toggle', () => {
    expect(collapsibleGroup(true)).toEqual({ expanded: true, toggleable: true });
  });

  it('shows every match while searching, with no toggle', () => {
    expect(collapsibleGroup(false, true)).toEqual({ expanded: true, toggleable: false });
    expect(collapsibleGroup(true, true)).toEqual({ expanded: true, toggleable: false });
  });
});
