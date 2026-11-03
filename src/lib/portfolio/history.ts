/**
 * Undo / redo (P4 foundation).
 *
 * A patch stack of documents, capped — not snapshots of the whole history. The
 * cap keeps memory bounded on a 4,000-node document, and because every command
 * returns a fresh document (structurally shared by the runtime), the cost of a
 * step is proportional to what changed, not to the document size.
 */
import { applyCommand, type Command, type CommandResult } from "./commands";
import type { PortfolioDocument } from "./types";

export const HISTORY_LIMIT = 100;

export interface HistoryState {
  past: PortfolioDocument[];
  present: PortfolioDocument;
  future: PortfolioDocument[];
}

export function initHistory(document: PortfolioDocument): HistoryState {
  return { past: [], present: document, future: [] };
}

/** Apply a command and push the previous document onto the undo stack. */
export function dispatch(state: HistoryState, command: Command): { state: HistoryState } & CommandResult {
  const result = applyCommand(state.present, command);
  if (!result.ok) return { ok: false, error: result.error, state };
  const past = [...state.past, state.present].slice(-HISTORY_LIMIT);
  return { ok: true, document: result.document, state: { past, present: result.document, future: [] } };
}

export function undo(state: HistoryState): HistoryState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
  };
}

export function redo(state: HistoryState): HistoryState {
  const next = state.future[0];
  if (!next) return state;
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: state.future.slice(1),
  };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}
