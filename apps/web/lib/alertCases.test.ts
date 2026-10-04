import { describe, expect, it } from 'vitest';
import { groupAlertCases } from './alertCases';

describe('groupAlertCases', () => {
  it('groups nearby findings for one trader while retaining each alert', () => {
    const entries = [
      { id: '1', owner: 'a', kind: 'spoofing', at: 100, alert: 'first' },
      { id: '2', owner: 'a', kind: 'spoofing', at: 200, alert: 'second' },
      { id: '3', owner: 'b', kind: 'spoofing', at: 150, alert: 'other trader' },
      { id: '4', owner: 'a', kind: 'wash', at: 150, alert: 'other rule' },
    ];
    const cases = groupAlertCases(entries, 100);
    expect(cases).toHaveLength(3);
    expect(cases.find(item => item.owner === 'a' && item.kind === 'spoofing')?.entries.map(item => item.alert))
      .toEqual(['second', 'first']);
    expect(entries.map(item => item.id)).toEqual(['1', '2', '3', '4']);
  });

  it('keeps findings more than ten minutes apart in separate cases', () => {
    const entries = [
      { id: '1', owner: 'a', kind: 'spoofing', at: 0, alert: 1 },
      { id: '2', owner: 'a', kind: 'spoofing', at: 600_001, alert: 2 },
    ];
    expect(groupAlertCases(entries)).toHaveLength(2);
  });
});
