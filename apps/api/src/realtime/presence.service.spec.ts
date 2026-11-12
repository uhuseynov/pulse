import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let presence: PresenceService;

  beforeEach(() => {
    presence = new PresenceService();
  });

  it('marks a user online on the first connection only', () => {
    expect(presence.connect('u1')).toBe(true);
    expect(presence.connect('u1')).toBe(false);
    expect(presence.isOnline('u1')).toBe(true);
  });

  it('keeps a user online until their last connection closes', () => {
    presence.connect('u1');
    presence.connect('u1');
    expect(presence.disconnect('u1')).toBe(false);
    expect(presence.isOnline('u1')).toBe(true);
    expect(presence.disconnect('u1')).toBe(true);
    expect(presence.isOnline('u1')).toBe(false);
  });

  it('ignores a disconnect for a user who was never connected', () => {
    expect(presence.disconnect('ghost')).toBe(true);
    expect(presence.isOnline('ghost')).toBe(false);
  });
});
