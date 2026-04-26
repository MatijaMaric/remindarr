import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
}

export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary] ${this.props.label ?? "section"} failed to render`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-zinc-500">
            Couldn&apos;t load {this.props.label ?? "this section"}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
