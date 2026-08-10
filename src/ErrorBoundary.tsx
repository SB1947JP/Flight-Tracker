import { Component, ReactNode } from 'react';
import { STORAGE_KEY } from './flights';

/**
 * Safety net for the tracker page. Without one, an uncaught render exception
 * unmounts the tree and leaves a blank page with no indication anything went
 * wrong.
 *
 * Separate from the editor's `components/ErrorBoundary` on purpose: that one's
 * reset button clears *all* of localStorage and deletes the editor's IndexedDB,
 * which is the right recovery for the editor and quite wrong here — a crash in
 * the flight tracker should not throw away someone's cached photo session, and
 * a crash in the editor should not throw away their itinerary. This one touches
 * only the tracker's own key.
 */

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  private handleReset = () => {
    // Malformed saved flights are the most likely cause of a crash here, so a
    // plain reload would just hit the same exception again.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 p-6">
        <div className="max-w-sm text-center">
          <p className="mb-2 text-sm text-neutral-300">Something went wrong.</p>
          <p className="mb-4 text-xs text-neutral-500">{this.state.error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={this.handleReset}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900"
          >
            Clear saved flights & reload
          </button>
        </div>
      </div>
    );
  }
}
