import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';
import { analyse, parseDocument } from '../dist/index.js';

const template = await readFile(new URL('../templates/Lernperiode-NR.md', import.meta.url), 'utf8');
const words = count => Array.from({ length: count }, () => 'Lernen').join(' ');
const day = (date, reflection = true) => `### Planung ${date}
- [ ] Datenmodell erstellen
- [x] Tests schreiben
- [ ] Webseite gestalten
${reflection ? `#### Tagesreflexion\n${words(60)}` : ''}
`;
const document = (days = day('18.09.2026'), final = words(120)) => `# Lern-Periode 5
- Name: Erika Muster
- Zeitraum: 18.09.2026 bis 25.09.2026
## Grob-Planung
### Noten
Ich möchte meine Leistungen im Modul verbessern.
### Veränderungen
Ich werde meine Arbeit regelmässiger dokumentieren.
### Projekte / neue Technologien
Ich entwickle eine Webseite mit einer Datenbank.
### Generelle Ziele
Ich implementiere eine funktionierende Suchfunktion.
## Tagesplanungen
${days}
## Lernperiode Reflexion
${final}
`;
const calendar = { periodDays: ['2026-09-18', '2026-09-25'], today: '2026-09-19' };
const codes = result => result.diagnostics.map(d => d.code);

test('the actual new template contains no student content or completed tasks', () => {
  const parsed = parseDocument(template);
  assert.equal(parsed.number, null);
  assert.equal(parsed.name, null);
  assert.equal(parsed.period, null);
  assert.equal(parsed.days.length, 1);
  assert.equal(parsed.days[0].tasks.length, 3);
  assert.ok(parsed.days[0].tasks.every(task => !task.filled && !task.checked));
  assert.equal(parsed.days[0].reflection.wordCount, 0);
  assert.equal(parsed.reflection.wordCount, 0);
  assert.ok(Object.values(parsed.overview).every(value => value.text === ''));
  assert.equal(analyse(template).status, 'red');
});

test('complete document passes strict checks', () => {
  assert.deepEqual(analyse(document()).diagnostics, []);
});

test('placeholder tasks do not satisfy next-day planning, including checked placeholders', () => {
  const next = day('25.09.2026', false).replace('Datenmodell erstellen', '...Ihr Text...').replace('Tests schreiben', '...Ihr Text...').replace('Webseite gestalten', '...Ihr Text...');
  const result = analyse(document(day('18.09.2026') + next), calendar);
  assert.ok(codes(result).includes('tasks.count'));
  assert.equal(result.diagnostics.filter(d => d.code === 'task.placeholder').length, 3);
  assert.ok(!codes(result).includes('reflection.daily-words'));
});

test('nested reflection has its own source position; free text remains supported', () => {
  const nested = parseDocument(document());
  assert.equal(nested.days[0].reflection.wordCount, 60);
  const position = nested.days[0].reflection.position;
  assert.ok(position.start.line > nested.days[0].position.start.line);
  assert.equal(document().split('\n')[position.start.line - 1], '#### Tagesreflexion');
  assert.equal(analyse(document().replace('#### Tagesreflexion\n', '\n')).status, 'green');
});

test('a reflection at the same heading level is diagnosed, not reassigned', () => {
  const result = analyse(document().replace('#### Tagesreflexion', '### Tagesreflexion'));
  assert.ok(codes(result).includes('reflection.orphan'));
  assert.ok(codes(result).includes('reflection.daily-words'));
});

test('HTML comments and fenced code cannot create dates or tasks', () => {
  const result = parseDocument(document() + '\n<!--\n### Planung 19.09.2026\n- [x] Fake task\n-->\n```md\n### Planung 20.09.2026\n- [x] Fake task\n```');
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].tasks.length, 3);
  const commented = document().replace(words(120), `<!-- ${words(120)} -->`);
  assert.equal(parseDocument(commented).reflection.wordCount, 0);
});

test('duplicate dates and duplicate reflections remain visible', () => {
  const result = analyse(document(day('18.09.2026') + day('18.09.2026') + `#### Tagesreflexion\n${words(60)}`));
  assert.equal(result.document.days.length, 2);
  assert.ok(codes(result).includes('day.duplicate'));
  assert.ok(codes(result).includes('reflection.duplicate'));
});

test('absence exempts tasks and reflection, but mentions in prose do not', () => {
  const absent = analyse(document('### Planung 18.09.2026\nkrank\n' + day('25.09.2026', false)), calendar);
  assert.equal(absent.status, 'green');
  const prose = analyse(document('### Planung 18.09.2026\nIch war krank.\n' + day('25.09.2026', false)), calendar);
  assert.ok(codes(prose).includes('tasks.count'));
});

test('today reflection is due, future reflection is not, and missing next day is reported', () => {
  const today = { ...calendar, today: '2026-09-18' };
  const result = analyse(document(day('18.09.2026', false) + day('25.09.2026', false), '...Ihr Text...'), today);
  assert.equal(result.status, 'yellow');
  assert.equal(result.diagnostics.filter(d => d.code === 'reflection.daily-words').length, 1);
  assert.equal(analyse(document(day('18.09.2026') + day('25.09.2026', false), '...Ihr Text...'), today).status, 'green');
  assert.ok(codes(analyse(document(), today)).includes('day.missing'));
  const overdue = analyse(document(day('18.09.2026', false) + day('25.09.2026', false)), calendar);
  assert.ok(codes(overdue).includes('reflection.daily-words'));
});

test('invalid calendar dates and contradictory ranges are rejected', () => {
  assert.throws(() => analyse(document(), { today: '2026-09-19' }), TypeError);
  assert.throws(() => analyse(document(), { periodDays: ['2026-02-30'], today: '2026-09-19' }), RangeError);
  assert.throws(() => analyse(document(), { ...calendar, periodDays: ['2026-09-18', '2026-09-18'] }), RangeError);
  assert.ok(codes(analyse(document(day('31.09.2026')))).includes('day.date'));
  assert.ok(codes(analyse(document().replace('18.09.2026 bis 25.09.2026', '25.09.2026 bis 18.09.2026'))).includes('period.range'));
});

test('word limits and task maximum can be adjusted independently of parsing', () => {
  assert.ok(codes(analyse(document(undefined, words(201)))).includes('reflection.period-words'));
  assert.equal(analyse(document(undefined, words(201)), { rules: { periodReflectionWords: [100, 250] } }).status, 'green');
  const six = day('18.09.2026').replace('#### Tagesreflexion', '- [ ] API testen\n- [ ] Schema prüfen\n- [ ] Fehler beheben\n#### Tagesreflexion');
  assert.ok(codes(analyse(document(six))).includes('tasks.count'));
});

test('legacy direct date headings and alternative Markdown task bullets are accepted', () => {
  const legacy = document().replace('## Tagesplanungen\n', '').replace('### Planung 18.09.2026', '## 18.09.2026').replace('#### Tagesreflexion', '### Tagesreflexion').replaceAll('- [', '* [');
  assert.equal(analyse(legacy).status, 'green');
});

test('the public module bundles for a browser without unresolved imports or Node built-ins', async () => {
  const result = await build({ entryPoints: [new URL('../dist/index.js', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1')], bundle: true, platform: 'browser', format: 'esm', write: false });
  assert.equal(result.errors.length, 0);
  assert.ok(result.outputFiles[0].contents.length > 0);
  assert.doesNotMatch(result.outputFiles[0].text, /from ['"]node:/);
});
