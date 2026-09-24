import type { Position } from 'unist';

export type { Position } from 'unist';
export type Status = 'green' | 'yellow' | 'red';
export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  position?: Position;
}
export interface TextContent {
  text: string;
  wordCount: number;
  position?: Position;
}
export interface Task extends TextContent {
  checked: boolean;
  filled: boolean;
}
export interface DayEntry {
  date: string | null;
  heading: string;
  position?: Position;
  tasks: Task[];
  absent: boolean;
  reflection: TextContent;
}
export type OverviewKey = 'grades' | 'changes' | 'projects' | 'goals';
export interface Documentation {
  number: number | null;
  name: string | null;
  period: { start: string; end: string } | null;
  overview: Partial<Record<OverviewKey, TextContent>>;
  days: DayEntry[];
  reflection: TextContent;
  diagnostics: Diagnostic[];
}
export interface Rules {
  minTasks: number;
  maxTasks: number;
  minOverviewCharacters: number;
  dailyReflectionWords: readonly [number, number];
  periodReflectionWords: readonly [number, number];
}
export interface CheckOptions {
  /** ISO calendar dates, without time or timezone. Both fields must be supplied together. */
  periodDays?: readonly string[];
  today?: string;
  learningPeriod?: number;
  rules?: Partial<Rules>;
}
export interface CheckResult {
  status: Status;
  document: Documentation;
  diagnostics: Diagnostic[];
  calendarChecksApplied: boolean;
}
