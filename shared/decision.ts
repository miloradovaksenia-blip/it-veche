import type { OptionId } from './options';

/**
 * Правила принятия решения IT-вече (чистые функции, без побочных эффектов).
 *
 * main     — первый тур, 3 варианта. Победа при строго > 50% действительных голосов.
 *            Иначе — второй тур между двумя лидерами; если равенство мешает определить
 *            двух финалистов — тай-брейк среди претендентов с одинаковым результатом.
 * tiebreak — выбирает `slots` финалистов из претендентов; «гарантированные» финалисты
 *            переносятся из предыдущего тура (carried).
 * runoff   — два финалиста, побеждает больший результат; равенство = ничья.
 * revote   — переголосование второго тура после ничьей (те же правила, что runoff).
 */
export type RoundType = 'main' | 'tiebreak' | 'runoff' | 'revote';

export type RoundOutcome =
  | { kind: 'no_votes' }
  | { kind: 'winner'; optionId: OptionId; majority: boolean }
  | { kind: 'runoff'; finalists: OptionId[] }
  | { kind: 'tiebreak'; contenders: OptionId[]; slots: number; carried: OptionId[] }
  | { kind: 'tie'; optionIds: OptionId[] };

export interface RoundInput {
  type: RoundType;
  eligible: OptionId[];
  counts: Partial<Record<OptionId, number>>;
  /** Только для tiebreak: сколько мест разыгрывается. */
  slots?: number;
  /** Только для tiebreak: финалисты, уже прошедшие без тай-брейка. */
  carried?: OptionId[];
}

export function totalVotes(eligible: OptionId[], counts: Partial<Record<OptionId, number>>): number {
  return eligible.reduce((s, id) => s + (counts[id] ?? 0), 0);
}

/**
 * Выбирает `slots` лучших вариантов. Если на границе равенство — возвращает
 * гарантированно прошедших (sure) и претендентов на оставшиеся места.
 */
export function pickTop(
  eligible: OptionId[],
  counts: Partial<Record<OptionId, number>>,
  slots: number,
): { resolved: true; picked: OptionId[] } | { resolved: false; sure: OptionId[]; contenders: OptionId[]; slotsLeft: number } {
  const sorted = [...eligible].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  if (slots >= sorted.length) return { resolved: true, picked: sorted };
  const boundary = counts[sorted[slots - 1]] ?? 0;
  const sure = sorted.filter((id) => (counts[id] ?? 0) > boundary);
  const contenders = sorted.filter((id) => (counts[id] ?? 0) === boundary);
  if (sure.length + contenders.length === slots) return { resolved: true, picked: [...sure, ...contenders] };
  return { resolved: false, sure, contenders, slotsLeft: slots - sure.length };
}

export function computeOutcome(input: RoundInput): RoundOutcome {
  const { type, eligible, counts } = input;
  const total = totalVotes(eligible, counts);
  if (total === 0) return { kind: 'no_votes' };

  if (type === 'main') {
    for (const id of eligible) {
      if ((counts[id] ?? 0) * 2 > total) return { kind: 'winner', optionId: id, majority: true };
    }
    const top = pickTop(eligible, counts, 2);
    if (top.resolved) return { kind: 'runoff', finalists: keepOrder(eligible, top.picked) };
    return { kind: 'tiebreak', contenders: keepOrder(eligible, top.contenders), slots: top.slotsLeft, carried: top.sure };
  }

  if (type === 'tiebreak') {
    const slots = input.slots ?? 1;
    const carried = input.carried ?? [];
    const top = pickTop(eligible, counts, slots);
    if (top.resolved) {
      const finalists = [...carried, ...top.picked];
      return { kind: 'runoff', finalists: keepOrder(['freedom', 'navigator', 'relay'], finalists) };
    }
    return {
      kind: 'tiebreak',
      contenders: keepOrder(eligible, top.contenders),
      slots: top.slotsLeft,
      carried: [...carried, ...top.sure],
    };
  }

  // runoff / revote: строго больше голосов — победа, иначе ничья.
  const sorted = [...eligible].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const best = counts[sorted[0]] ?? 0;
  const leaders = sorted.filter((id) => (counts[id] ?? 0) === best);
  if (leaders.length === 1) return { kind: 'winner', optionId: leaders[0], majority: best * 2 > total };
  return { kind: 'tie', optionIds: keepOrder(eligible, leaders) };
}

function keepOrder(order: OptionId[], ids: OptionId[]): OptionId[] {
  return order.filter((id) => ids.includes(id));
}

/**
 * Проценты методом наибольшего остатка: целые числа, сумма ровно 100
 * (если есть хотя бы один голос).
 */
export function percentages(eligible: OptionId[], counts: Partial<Record<OptionId, number>>): Record<string, number> {
  const total = totalVotes(eligible, counts);
  const result: Record<string, number> = {};
  if (total === 0) {
    for (const id of eligible) result[id] = 0;
    return result;
  }
  const raw = eligible.map((id) => ({ id, exact: ((counts[id] ?? 0) * 100) / total }));
  let assigned = 0;
  for (const r of raw) {
    result[r.id] = Math.floor(r.exact);
    assigned += result[r.id];
  }
  const byRemainder = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; i < 100 - assigned; i++) result[byRemainder[i % byRemainder.length].id] += 1;
  return result;
}
