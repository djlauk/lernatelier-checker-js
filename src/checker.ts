import type { CheckOptions, CheckResult, Diagnostic, Documentation, OverviewKey, Position, Rules, TextContent } from './model.js';
import { isoDate } from './text.js';
import { parseDocument } from './parser.js';

export const defaultRules: Readonly<Rules> = Object.freeze({
  minTasks: 3,
  maxTasks: 5,
  minOverviewCharacters: 20,
  dailyReflectionWords: Object.freeze([50, 100] as const),
  periodReflectionWords: Object.freeze([100, 200] as const),
});

/** No implicit clock: supply calendar dates explicitly for reproducible deadline checks. */
export function checkDocument(document: Documentation, options: CheckOptions = {}): CheckResult {
  const rules = { ...defaultRules, ...options.rules };
  for (const [min, max] of [[rules.minTasks, rules.maxTasks], rules.dailyReflectionWords, rules.periodReflectionWords]) {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < min) throw new RangeError('Invalid rule limits');
  }
  if (!Number.isSafeInteger(rules.minOverviewCharacters) || rules.minOverviewCharacters < 0) throw new RangeError('Invalid overview character limit');
  if (options.learningPeriod !== undefined && (!Number.isSafeInteger(options.learningPeriod) || options.learningPeriod < 1)) throw new RangeError('Invalid learning period number');
  const calendar = options.periodDays !== undefined;
  if (calendar !== (options.today !== undefined)) throw new TypeError('Supply periodDays and today together');
  if (options.today !== undefined && !isoDate(options.today)) throw new RangeError('Invalid today date');
  const periodDays = [...(options.periodDays ?? [])].sort();
  if (calendar && (!periodDays.length || periodDays.some(day => !isoDate(day)) || new Set(periodDays).size !== periodDays.length)) throw new RangeError('Expected nonempty, unique ISO period days');
  const diagnostics: Diagnostic[] = [...document.diagnostics];
  const add = (code: string, message: string, position?: Position, severity: Diagnostic['severity'] = 'warning') => {
    diagnostics.push({ code, severity, message, position });
  };
  if (!document.number || !Number.isSafeInteger(document.number)) add('period.number', 'Gültige Lernperiodennummer fehlt.', undefined, 'error');
  else if (options.learningPeriod !== undefined && options.learningPeriod !== document.number) add('period.number-mismatch', 'Lernperiodennummer stimmt nicht mit der Konfiguration überein.', undefined, 'error');
  if (!document.name) add('name.missing', 'Name fehlt oder enthält einen Platzhalter.', undefined, 'error');
  if (!document.period || document.period.start > document.period.end) add('period.range', 'Gültiger Zeitraum fehlt oder Beginn liegt nach dem Ende.', undefined, 'error');
  else if (calendar && periodDays.some(day => day < document.period!.start || day > document.period!.end)) add('period.calendar-range', 'Unterrichtstage liegen ausserhalb des angegebenen Zeitraums.', undefined, 'error');
  const labels: Record<OverviewKey, string> = { grades: 'Noten', changes: 'Veränderungen', projects: 'Projekte / neue Technologien', goals: 'Generelle Ziele' };
  for (const key of Object.keys(labels) as OverviewKey[]) {
    const section = document.overview[key];
    if (!section || section.text.length < rules.minOverviewCharacters) add(`overview.${key}`, `Abschnitt „${labels[key]}“ fehlt oder enthält zu wenig eigenen Text.`, section?.position);
  }
  if (!document.days.length) add('days.missing', 'Keine Tagesplanungen gefunden.', undefined, 'error');
  const seen = new Set<string>();
  for (const day of document.days) {
    if (!day.date) add('day.date', 'Datum der Tagesplanung fehlt oder ist ungültig.', day.position, 'error');
    else {
      if (seen.has(day.date)) add('day.duplicate', `Tagesplanung für ${day.date} ist mehrfach vorhanden.`, day.position, 'error');
      seen.add(day.date);
      if (calendar && !periodDays.includes(day.date)) add('day.outside-calendar', `${day.date} ist kein konfigurierter Unterrichtstag.`, day.position);
      if (document.period && (day.date < document.period.start || day.date > document.period.end)) add('day.outside-period', 'Tagesplanung liegt ausserhalb des Zeitraums.', day.position, 'error');
    }
  }
  const checkWords = (value: TextContent, limits: readonly [number, number], code: string, label: string) => {
    if (value.wordCount < limits[0] || value.wordCount > limits[1]) add(code, `${label}: ${value.wordCount} Wörter; erwartet sind ${limits[0]}–${limits[1]}.`, value.position);
  };
  const nextDay = periodDays.find(day => day > options.today!);
  if (calendar) {
    for (const date of periodDays.filter(day => day <= options.today! || day === nextDay)) {
      if (!seen.has(date)) add('day.missing', `Tagesplanung für ${date} fehlt.`);
    }
  }
  for (const day of document.days) {
    if (!day.date || day.absent) continue;
    const required = !calendar || periodDays.includes(day.date) && (day.date <= options.today! || day.date === nextDay);
    if (!required) continue;
    const filled = day.tasks.filter(task => task.filled);
    if (filled.length < rules.minTasks || filled.length > rules.maxTasks) add('tasks.count', `${day.date}: ${filled.length} ausgefüllte Arbeitspakete; erwartet sind ${rules.minTasks}–${rules.maxTasks}.`, day.position);
    for (const task of day.tasks.filter(task => !task.filled)) add('task.placeholder', 'Arbeitspaket enthält nur einen Platzhalter.', task.position);
    // Today's reflection is required before the class can finish the lesson.
    if (!calendar || day.date <= options.today!) checkWords(day.reflection, rules.dailyReflectionWords, 'reflection.daily-words', `Tagesreflexion ${day.date}`);
  }
  if (!calendar || options.today! >= periodDays.at(-1)!) checkWords(document.reflection, rules.periodReflectionWords, 'reflection.period-words', 'Lernperiodenreflexion');
  return {
    status: diagnostics.some(d => d.severity === 'error') ? 'red' : diagnostics.length ? 'yellow' : 'green',
    document, diagnostics, calendarChecksApplied: calendar,
  };
}

export function analyse(markdown: string, options: CheckOptions = {}): CheckResult {
  return checkDocument(parseDocument(markdown), options);
}
