import { getOption, type OptionId } from '../../../shared/options';
import type { RoundOutcome, RoundType } from '../../../shared/decision';

export const title = (id: OptionId) => getOption(id)?.title ?? id;

export function roundLabel(type: RoundType, number: number): string {
  switch (type) {
    case 'main':
      return number === 1 ? 'Первый тур' : `Тур ${number}`;
    case 'tiebreak':
      return 'Тай-брейк';
    case 'runoff':
      return 'Второй тур';
    case 'revote':
      return 'Переголосование';
  }
}

export function outcomeHeadline(o: RoundOutcome): string {
  switch (o.kind) {
    case 'winner':
      return `Выбор вече: «${title(o.optionId)}»`;
    case 'runoff':
      return 'Абсолютного большинства нет';
    case 'tiebreak':
      return 'Равенство голосов';
    case 'tie':
      return 'Ничья';
    case 'no_votes':
      return 'Голосов не поступило';
  }
}

export function outcomeDetail(o: RoundOutcome): string {
  switch (o.kind) {
    case 'winner':
      return 'Итоговое решение подтверждает генеральный директор';
    case 'runoff':
      return `Во второй тур выходят «${title(o.finalists[0])}» и «${title(o.finalists[1])}»`;
    case 'tiebreak':
      return `Финалистов определит тай-брейк: ${o.contenders.map((id) => `«${title(id)}»`).join(', ')}`;
    case 'tie':
      return 'Победитель не определён: переголосование или решение генерального директора';
    case 'no_votes':
      return 'Организатор может повторить голосование';
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const votesWord = (n: number) => plural(n, 'голос', 'голоса', 'голосов');
