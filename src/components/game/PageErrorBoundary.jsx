import React from "react";

// Catches render errors in the page outlet so a single throwing page doesn't
// blank out the entire app (React unmounts the whole tree without a boundary).
// Shows the error message inline so the cause is visible, and offers a retry.
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Page render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="painted-panel canvas-grain p-6 max-w-lg mx-auto mt-10 text-center">
          <h2 className="font-display font-bold text-lg text-destructive glow-cyan mb-2">
            This page hit an error
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            The hub is still usable — try another page, or retry.
          </p>
          <pre className="text-[10px] text-left bg-muted/40 rounded-lg p-3 mb-4 overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="painted-btn px-4 py-2 text-xs"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {this.props.children}
      </div>
    );
  }
}