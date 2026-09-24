# lernatelier-checker-js

Checks the formal completeness of Lernatelier planning documents using a Markdown
AST. Provides JavaScript ES modules and TypeScript declarations for use in websites
and VS Code extensions. Diagnostic messages are in German.

## Installation

Install the compiled `.tgz` asset from a GitHub Release. For example, add this to
your application's `package.json` and run `npm install`:

```json
{
  "dependencies": {
    "lernatelier-checker": "https://github.com/OWNER/REPOSITORY/releases/download/v0.1.0/lernatelier-checker-0.1.0.tgz"
  }
}
```

Replace `OWNER/REPOSITORY` and the version with the desired release. The package
includes compiled JavaScript, type declarations and a document template; consumers
do not need a TypeScript build. Node.js consumers require Node.js 22 or newer.
For websites, include the package through your application's bundler.

## Usage

```ts
import { analyse } from 'lernatelier-checker';

const result = analyse(markdown, {
  learningPeriod: 5,
  periodDays: ['2026-09-18', '2026-09-25'],
  today: '2026-09-19',
});
```

The result contains:

- `status`: `green`, `yellow` or `red`. Errors produce red; warnings produce yellow;
  a document without findings is green.
- `diagnostics`: findings with a code, severity, German message and optional source
  position. Positions use one-based lines and columns in the original Markdown.
  Missing sections may have no position.
- `document`: the parsed documentation model, including metadata, overview sections,
  daily entries, tasks and reflections.
- `calendarChecksApplied`: whether a school-day calendar was supplied.

Invalid configuration throws an exception. Incomplete documents produce diagnostics.
Green indicates formal completeness. The teacher assesses task quality, measurable
objectives and the quality of reflections.

### Calendar and deadlines

Dates are ISO calendar strings (`YYYY-MM-DD`), without timestamps or timezones.
Supply both `today` and a nonempty list of unique `periodDays`, or neither.
`learningPeriod` optionally checks the document's period number against the expected one.

With a calendar, planning is required through today and for the next school day.
Later days may contain placeholder tasks. Daily reflections are due on the respective
school day; the period reflection is due on the last configured school day.
Absence excuses that day's tasks and reflection.

Without a calendar, all dated entries and both reflection types are checked as a
completed document.

### Parsing and configurable rules

Parsing and validation can be called separately:

```ts
import { parseDocument, checkDocument } from 'lernatelier-checker';

const document = parseDocument(markdown);
const result = checkDocument(document, {
  rules: {
    minTasks: 3,
    maxTasks: 5,
    minOverviewCharacters: 20,
    dailyReflectionWords: [50, 100],
    periodReflectionWords: [100, 200],
  },
});
```

The values above are the defaults. The same `rules` option is accepted by `analyse`.
Calendar options also apply to `checkDocument`.

## Document format

Use [Lernperiode-NR.md](templates/Lernperiode-NR.md) as the reference template.

- All four overview sections must contain the configured minimum of own text.
- Required days need the configured number of filled tasks. Checked placeholders
  never count as completed content.
- `...Ihr Text...`, `...`, `Erstes Arbeitspaket` and `Viertes AP` are placeholders.
  Student text added to those placeholders is retained.
- HTML comments and code blocks do not count as student content.
- Task lists inside blockquotes do not count as work packages; normal quoted prose
  is retained as text.
- Day headings accept `Planung DD.MM.YYYY` or `DD.MM.YYYY`, including direct day
  sections without a `Tagesplanungen` container.
- Explicit `Tagesreflexion` or `Reflexion` headings must be direct child sections
  of their day. Free reflection text after the task list is also accepted.
- Duplicate dates or sections and misplaced reflection headings are diagnosed.
- To indicate absence, place `absence`, `absent`, `Absenz`, `abwesend`, `Krankheit`
  or `krank` alone in a paragraph directly below the day heading, before any
  child section.
- A word is a sequence of Unicode letters or numbers; internal apostrophes and
  hyphens join a word. Markup, comments and placeholders do not count as words.

## Development

Use Node.js 22+ and its bundled npm package manager:

```sh
npm ci
npm test
npm run build
```

`npm test` builds the project and runs the tests, including a browser bundling check.
`npm run build` emits JavaScript ES modules, declarations and source maps into `dist/`.
`npm run check` checks TypeScript types without emitting files.

The parser uses [remark-parse](https://github.com/remarkjs/remark/tree/main/packages/remark-parse)
and [remark-gfm](https://github.com/remarkjs/remark-gfm) to build a Markdown AST and
map it to the documentation model. Validation rules are separate from parsing.

To verify the distribution locally after building:

```sh
npm run verify:package
```

This creates an archive in `release/`, checks its contents and installs it into an
OS temporary directory without development dependencies or install scripts. It then
checks that the installed package's public API works.

## Releases

The GitHub Actions workflow runs on pushed `v*` tags. The tag must exactly match
`package.json`, for example `v0.1.0` for version `0.1.0`.

Update `package.json` and `package-lock.json` with
`npm version --no-git-tag-version <version>`, commit the changes, then create and
push an annotated release tag:

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

The workflow runs `npm ci`, builds and tests, and verifies the package archive in
an isolated consumer before creating a GitHub Release with the `.tgz` attached.
Tags containing a hyphen produce prereleases. Existing releases are not overwritten.

The repository must contain `package.json` and `.github/` at its root. The workflow
uses the automatic `GITHUB_TOKEN` with `contents: write`. No npm registry credentials
are required. `private: true` prevents registry publishing while allowing release
archives to be packed and installed.
