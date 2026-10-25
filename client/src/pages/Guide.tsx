import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Backdrop, Button, Logo } from '../components/ui';

const STEPS: [string, string][] = [
  ['Создать сессию', 'Админ-панель → «Новая сессия». Укажите ожидаемое число участников. Для строгого режима включите одноразовые коды и распечатайте их.'],
  ['Вывести QR на экран', 'Откройте «Экран зала (16:9)» на ноутбуке, подключённом к проектору, и нажмите «Во весь экран». QR-код ведёт на публичный HTTPS-адрес сессии.'],
  ['Открыть тур', '«Начать голосование». Участники сканируют QR, выбирают вариант и подтверждают. На экране растёт счётчик «Голосов принято», распределение скрыто.'],
  ['Закрыть тур', '«Завершить голосование» (с подтверждением). Новые голоса больше не принимаются. Предварительный итог видите только вы.'],
  ['Показать результаты', '«Показать результаты». На экране зала — пауза и плавное раскрытие диаграмм, на телефонах — итоги тура.'],
  ['При необходимости — второй тур', 'Если ни один вариант не набрал больше 50%, панель предложит «Запустить второй тур» (или «Запустить тай-брейк», если равенство мешает определить финалистов). Далее — снова шаги 4–5.'],
  ['Ничья во втором туре', 'Победитель не назначается автоматически: «Переголосовать» или «ГД выбрал …» — решение генерального директора.'],
  ['Зафиксировать итог', 'После подтверждения генеральным директором — «Зафиксировать решение». На экране зала появится «РЕШЕНИЕ ПРИНЯТО». Если выбрана «Цифровая эстафета», участники увидят кнопку «У меня есть кейс!».'],
  ['После встречи', '«Экспортировать CSV» — итоги по турам без анонимных ключей и контактов. Заявки добровольцев — в отдельном блоке панели, их можно удалить по запросу.'],
];

export default function Guide() {
  return (
    <div className="min-h-screen">
      <Backdrop intensity={0.4} />
      <div className="mx-auto max-w-3xl px-5 py-8 print:text-black">
        <div className="no-print flex items-center justify-between">
          <Logo />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Печать
            </Button>
            <Link to="/admin" className="glass inline-flex min-h-[48px] items-center rounded-2xl px-5 font-semibold">
              В панель
            </Link>
          </div>
        </div>
        <h1 className="mt-8 font-display text-3xl font-semibold">Памятка организатору</h1>
        <p className="mt-2 text-white/65 print:text-black">IT-вече за 5–7 минут: создать сессию → вывести QR → открыть тур → закрыть → показать результаты → при необходимости второй тур → зафиксировать итог.</p>
        <ol className="mt-8 space-y-4">
          {STEPS.map(([h, t], i) => (
            <li key={h} className="glass flex gap-4 rounded-2xl p-5 print:border print:border-black/30 print:bg-white">
              <span className="font-display text-2xl font-semibold text-white/40 print:text-black">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="font-semibold">{h}</h2>
                <p className="mt-1 text-white/70 print:text-black">{t}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl border border-white/10 p-5 text-sm text-white/65 print:text-black">
          <p className="font-semibold text-white print:text-black">Перед встречей (за 10 минут)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Прогоните демо-сессию: «Демо» → тестовые голоса → результаты → сброс.</li>
            <li>Проверьте QR с двух телефонов (iPhone и Android) через мобильную сеть и Wi-Fi зала.</li>
            <li>Не открывайте реальную сессию для проверки: голоса в ней настоящие.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
