import { describe, expect, it } from 'vitest';
import { badgeCode, badgeFor, inkFor } from './badges';

describe('badges', () => {
  it('gives the house bots fixed floor codes', () => {
    expect(badgeFor('market-maker', true)).toMatchObject({ code: 'MKMK', isBot: true });
    expect(badgeFor('adaptive', true).code).toBe('AI');
    expect(badgeFor('noise-2', true).code).toBe('NOI2');
  });

  it('builds player codes from names', () => {
    expect(badgeCode('Raj')).toBe('RAJ');
    expect(badgeCode('Prasiddha')).toBe('PRAS');
    expect(badgeCode('Judge Ann Lee')).toBe('JAL');
    expect(badgeCode('Zoë')).toBe('ZOË');
    expect(badgeCode('team-7')).toBe('T7');
    expect(badgeCode('   ')).toBe('?');
  });

  it('is stable per name and a player named like a bot does not get the bot badge', () => {
    expect(badgeFor('Raj', false)).toEqual(badgeFor('Raj', false));
    expect(badgeFor('market-maker', false).code).toBe('MM');
  });

  it('picks the more readable text colour for each jacket', () => {
    expect(inkFor('#2F6FED')).toBe('#FFFFFF');
    expect(inkFor('#38BDF8')).toBe('#14171C');
  });
});
