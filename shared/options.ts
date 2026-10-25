export type OptionId = 'freedom' | 'navigator' | 'relay';
export type Accent = 'coral' | 'blue' | 'emerald';

export interface VoteOption {
  id: OptionId;
  number: string;
  title: string;
  description: string;
  slogan: string;
  accent: Accent;
  finalPhrase: string;
}

/** Три равноправных варианта. Порядок фиксирован (01, 02, 03), без выделения «правильного». */
export const OPTIONS: VoteOption[] = [
  {
    id: 'freedom',
    number: '01',
    title: 'Цифровая свобода',
    description:
      'Завершаем регулярные IT-экстеншены. Освобождаем время планёрки; руководители самостоятельно выбирают и применяют цифровые инструменты.',
    slogan: 'Дальше — самостоятельно',
    accent: 'coral',
    finalPhrase: 'ИИ остаётся. Пятнадцать минут возвращаются в календарь',
  },
  {
    id: 'navigator',
    number: '02',
    title: 'Цифровой навигатор',
    description:
      'Сохраняем формат: раз в две недели постоянный эксперт показывает новые инструменты, лайфхаки и практические кейсы.',
    slogan: 'Продолжаем открывать новое',
    accent: 'blue',
    finalPhrase: 'Продолжаем открывать новое',
  },
  {
    id: 'relay',
    number: '03',
    title: 'Цифровая эстафета',
    description:
      'Сохраняем 15 минут раз в две недели, но выступающий меняется: руководители делятся собственными кейсами. Руководитель цифровых компетенций остаётся экспертом, советником, методологом и координатором.',
    slogan: 'Делимся опытом. Развиваемся вместе',
    accent: 'emerald',
    finalPhrase: 'Следующий цифровой герой — среди нас',
  },
];

export const OPTION_IDS: OptionId[] = OPTIONS.map((o) => o.id);

export function getOption(id: string): VoteOption | undefined {
  return OPTIONS.find((o) => o.id === id);
}

export function isOptionId(id: unknown): id is OptionId {
  return typeof id === 'string' && OPTION_IDS.includes(id as OptionId);
}

/** Вопрос повестки по умолчанию (организатор может изменить). */
export const DEFAULT_AGENDA = 'Какой формат «цифровых 15 минут» выбираем дальше?';
