import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Heading, Nodes, Root, RootContent } from 'mdast';
import type { Diagnostic, Documentation, OverviewKey, Task, TextContent } from './model.js';
import { countWords, germanDate, ownText, textOf } from './text.js';

const parser = unified().use(remarkParse).use(remarkGfm);
interface Section {
  heading: Heading;
  title: string;
  body: RootContent[];
  children: Section[];
}
const normalize = (value: string) => value.toLocaleLowerCase('de').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
const dayPattern = /^(?:Planung\s+)?(\d{1,2}\.\d{1,2}\.\d{4}|tt\.mm\.jjjj)$/i;
const overviewNames: Record<string, OverviewKey> = {
  noten: 'grades', 'veränderungen': 'changes',
  'projekte / neue technologien': 'projects', 'generelle ziele': 'goals',
};

function sections(root: Root): { preamble: RootContent[]; all: Section[] } {
  const all: Section[] = [];
  const stack: Section[] = [];
  const preamble: RootContent[] = [];
  for (const node of root.children) {
    if (node.type === 'heading') {
      const section: Section = { heading: node, title: textOf(node), body: [], children: [] };
      while (stack.length && stack.at(-1)!.heading.depth >= node.depth) stack.pop();
      stack.at(-1)?.children.push(section);
      all.push(section);
      stack.push(section);
    } else {
      (stack.at(-1)?.body ?? preamble).push(node);
    }
  }
  return { preamble, all };
}

function bodyNodes(section: Section): RootContent[] {
  return [...section.body, ...section.children.flatMap(bodyNodes)];
}
function content(nodes: readonly Nodes[], position?: TextContent['position']): TextContent {
  const text = ownText(nodes.map(textOf).join('\n'));
  return { text, wordCount: countWords(text), position };
}
function tasksIn(nodes: readonly Nodes[]): Task[] {
  const tasks: Task[] = [];
  const visit = (node: Nodes) => {
    // Examples inside quotations and code are not work packages.
    if (node.type === 'blockquote' || node.type === 'code' || node.type === 'html') return;
    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      const ownNodes = node.children.filter(child => child.type !== 'list');
      const value = content(ownNodes, node.position);
      tasks.push({ ...value, checked: node.checked, filled: /[\p{L}\p{N}]/u.test(value.text) });
    }
    if ('children' in node) node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return tasks;
}
function reflectionNodes(nodes: readonly RootContent[]): RootContent[] {
  return nodes.filter(node => node.type !== 'list');
}

/** Parse incomplete documents too; findings retain original, one-based source positions. */
export function parseDocument(markdown: string): Documentation {
  const { preamble, all } = sections(parser.parse(markdown));
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, message: string, section: Section) => diagnostics.push({
    code, severity: 'error', message, position: section.heading.position,
  });
  const titleSections = all.filter(s => /^lern periode\s+/i.test(normalize(s.title)));
  const title = titleSections[0];
  for (const duplicate of titleSections.slice(1)) report('structure.duplicate-title', 'Mehrere Lernperioden-Titel gefunden.', duplicate);
  const numberMatch = title && /^lern periode\s+(\d+)$/i.exec(normalize(title.title));
  const metadata = [...preamble, ...(title?.body ?? [])].map(textOf).join('\n');
  const names = [...metadata.matchAll(/^Name:\s*([^\n]*)$/gm)];
  const periods = [...metadata.matchAll(/^Zeitraum:\s*(\S+)\s+(?:bis|[-–])\s+(\S+)\s*$/gm)];
  if (title && (names.length > 1 || periods.length > 1)) report('metadata.duplicate', 'Name oder Zeitraum ist mehrfach angegeben.', title);
  const rawName = names[0]?.[1]?.trim();
  const start = germanDate(periods[0]?.[1] ?? '');
  const end = germanDate(periods[0]?.[2] ?? '');
  const overview: Documentation['overview'] = {};
  const overviewSections = all.filter(s => normalize(s.title) === 'grob planung' || normalize(s.title) === 'grobplanung');
  for (const duplicate of overviewSections.slice(1)) report('structure.duplicate-overview', 'Grobplanung ist mehrfach vorhanden.', duplicate);
  for (const section of overviewSections.flatMap(s => s.children)) {
    const key = overviewNames[normalize(section.title)];
    if (!key) continue;
    if (overview[key]) report('structure.duplicate-section', `Abschnitt „${section.title}“ ist mehrfach vorhanden.`, section);
    else overview[key] = content(bodyNodes(section), section.heading.position);
  }
  const dailySections = all.filter(s => dayPattern.test(s.title));
  const days = dailySections.map(section => {
    const match = dayPattern.exec(section.title)!;
    const reflectionSections = section.children.filter(s => ['tagesreflexion', 'reflexion'].includes(normalize(s.title)));
    for (const duplicate of reflectionSections.slice(1)) report('reflection.duplicate', 'Tagesreflexion ist mehrfach vorhanden.', duplicate);
    const reflectionSection = reflectionSections[0];
    const planningNodes = [...section.body, ...section.children.filter(s => !reflectionSections.includes(s)).flatMap(bodyNodes)];
    const reflection = reflectionSection
      ? content(bodyNodes(reflectionSection), reflectionSection.heading.position)
      : content(reflectionNodes(section.body), section.heading.position);
    return {
      date: germanDate(match[1]!), heading: section.title, position: section.heading.position,
      tasks: tasksIn(planningNodes), reflection,
      absent: section.body.some(node => node.type === 'paragraph' && /^(krank|krankheit|absenz|abwesend|absence)$/i.test(textOf(node).trim())),
    };
  });
  for (const section of all.filter(s => ['tagesreflexion', 'reflexion'].includes(normalize(s.title)))) {
    if (!dailySections.some(day => day.children.includes(section))) report('reflection.orphan', 'Tagesreflexion muss dem geplanten Tag untergeordnet sein.', section);
  }
  const finalSections = all.filter(s => normalize(s.title) === 'lernperiode reflexion');
  for (const duplicate of finalSections.slice(1)) report('reflection.period-duplicate', 'Lernperiodenreflexion ist mehrfach vorhanden.', duplicate);
  return {
    number: numberMatch ? Number(numberMatch[1]) : null,
    name: rawName && rawName !== 'Exemplibus Exemplio' && ownText(rawName) ? rawName : null,
    period: start && end ? { start, end } : null,
    overview, days,
    reflection: content(finalSections[0] ? bodyNodes(finalSections[0]) : [], finalSections[0]?.heading.position),
    diagnostics,
  };
}
