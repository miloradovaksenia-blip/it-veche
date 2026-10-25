import { describe, expect, it } from 'vitest';
import { computeOutcome, percentages } from '../../shared/decision';
import type { OptionId } from '../../shared/options';

const ALL: OptionId[] = ['freedom', 'navigator', 'relay'];
const main = (f: number, n: number, r: number) => computeOutcome({ type: 'main', eligible: ALL, counts: { freedom: f, navigator: n, relay: r } });

describe('первый тур', () => {
  it('победа при строго > 50%', () => {
    expect(main(6, 3, 2)).toEqual({ kind: 'winner', optionId: 'freedom', majority: true });
    expect(main(0, 0, 1)).toEqual({ kind: 'winner', optionId: 'relay', majority: true });
  });

  it('ровно 50% — не победа', () => {
    expect(main(5, 3, 2)).toEqual({ kind: 'runoff', finalists: ['freedom', 'navigator'] });
  });

  it('нет большинства — второй тур двух лидеров', () => {
    expect(main(4, 5, 3)).toEqual({ kind: 'runoff', finalists: ['freedom', 'navigator'] });
    expect(main(2, 4, 5)).toEqual({ kind: 'runoff', finalists: ['navigator', 'relay'] });
  });

  it('равенство двух лидеров — оба во втором туре', () => {
    expect(main(5, 5, 2)).toEqual({ kind: 'runoff', finalists: ['freedom', 'navigator'] });
  });

  it('равенство за второе место — тай-брейк', () => {
    expect(main(5, 3, 3)).toEqual({ kind: 'tiebreak', contenders: ['navigator', 'relay'], slots: 1, carried: ['freedom'] });
  });

  it('все три равны — тай-брейк на два места', () => {
    expect(main(4, 4, 4)).toEqual({ kind: 'tiebreak', contenders: ['freedom', 'navigator', 'relay'], slots: 2, carried: [] });
  });

  it('нет голосов', () => {
    expect(main(0, 0, 0)).toEqual({ kind: 'no_votes' });
  });
});

describe('тай-брейк', () => {
  it('выявляет финалиста и добавляет к перенесённому', () => {
    expect(
      computeOutcome({ type: 'tiebreak', eligible: ['navigator', 'relay'], counts: { navigator: 3, relay: 7 }, slots: 1, carried: ['freedom'] }),
    ).toEqual({ kind: 'runoff', finalists: ['freedom', 'relay'] });
  });

  it('повторное равенство — новый тай-брейк', () => {
    expect(
      computeOutcome({ type: 'tiebreak', eligible: ['navigator', 'relay'], counts: { navigator: 4, relay: 4 }, slots: 1, carried: ['freedom'] }),
    ).toEqual({ kind: 'tiebreak', contenders: ['navigator', 'relay'], slots: 1, carried: ['freedom'] });
  });

  it('три претендента на два места: один явно впереди, двое равны', () => {
    expect(
      computeOutcome({ type: 'tiebreak', eligible: ALL, counts: { freedom: 6, navigator: 2, relay: 2 }, slots: 2, carried: [] }),
    ).toEqual({ kind: 'tiebreak', contenders: ['navigator', 'relay'], slots: 1, carried: ['freedom'] });
  });

  it('три претендента на два места: однозначно', () => {
    expect(computeOutcome({ type: 'tiebreak', eligible: ALL, counts: { freedom: 1, navigator: 5, relay: 4 }, slots: 2, carried: [] })).toEqual({
      kind: 'runoff',
      finalists: ['navigator', 'relay'],
    });
  });
});

describe('второй тур', () => {
  const runoff = (a: number, b: number) =>
    computeOutcome({ type: 'runoff', eligible: ['navigator', 'relay'], counts: { navigator: a, relay: b } });

  it('больше голосов — победа', () => {
    expect(runoff(8, 7)).toEqual({ kind: 'winner', optionId: 'navigator', majority: true });
  });

  it('равенство — ничья, победитель не назначается', () => {
    expect(runoff(6, 6)).toEqual({ kind: 'tie', optionIds: ['navigator', 'relay'] });
    expect(computeOutcome({ type: 'revote', eligible: ['navigator', 'relay'], counts: { navigator: 2, relay: 2 } }).kind).toBe('tie');
  });
});

describe('проценты', () => {
  it('сумма ровно 100 с учётом округления', () => {
    const cases = [
      [1, 1, 1],
      [2, 2, 3],
      [10, 7, 6],
      [13, 13, 14],
      [1, 0, 0],
      [33, 33, 34],
    ];
    for (const [f, n, r] of cases) {
      const p = percentages(ALL, { freedom: f, navigator: n, relay: r });
      expect(p.freedom + p.navigator + p.relay).toBe(100);
    }
    expect(percentages(ALL, { freedom: 1, navigator: 1, relay: 1 })).toEqual({ freedom: 34, navigator: 33, relay: 33 });
  });

  it('нет голосов — нули', () => {
    expect(percentages(ALL, {})).toEqual({ freedom: 0, navigator: 0, relay: 0 });
  });
});
