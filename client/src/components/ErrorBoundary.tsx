import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showStackTrace: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showStackTrace: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, showStackTrace: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private toggleStackTrace = () => {
    this.setState((prevState) => ({
      showStackTrace: !prevState.showStackTrace,
    }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "var(--paper)", color: "var(--ink)" }}>
          <div className="card w-full max-w-2xl p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--panel)" }}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">Something went wrong</h1>
                <p className="mono">The application encountered an unexpected error</p>
              </div>
            </div>

            {/* Error Message */}
            <div className="mb-6">
              <label className="mono mb-2 block">
                Error Message
              </label>
              <div className="panel p-4">
                <p className="font-mono text-sm">
                  {this.state.error?.message || 'Unknown error'}
                </p>
              </div>
            </div>

            {/* Stack Trace (Collapsible) */}
            <div className="mb-6">
              <button
                onClick={this.toggleStackTrace}
                className="mono flex items-center justify-between w-full mb-2"
              >
                <span>Stack Trace</span>
                {this.state.showStackTrace ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {this.state.showStackTrace && (
                <div className="panel p-4 overflow-auto max-h-64">
                  <pre className="font-mono text-xs whitespace-pre-wrap" style={{ color: "var(--quiet)" }}>
                    {this.state.error?.stack || 'No stack trace available'}
                    {this.state.errorInfo?.componentStack && (
                      <>
                        {'\n\n'}
                        {'Component Stack:'}
                        {'\n'}
                        {this.state.errorInfo.componentStack}
                      </>
                    )}
                  </pre>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={this.handleReload}
                className="btn ink"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={() => window.history.back()}
                className="btn"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
