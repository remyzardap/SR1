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
        <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-[#111111] border border-[#222222] rounded-xl p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#222222] flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white/70" />
              </div>
              <div>
                <h1 className="text-xl font-medium text-white">Something went wrong</h1>
                <p className="text-white/50 text-sm">The application encountered an unexpected error</p>
              </div>
            </div>

            {/* Error Message */}
            <div className="mb-6">
              <label className="text-xs uppercase tracking-wider text-white/40 mb-2 block">
                Error Message
              </label>
              <div className="bg-[#0d0a1a] border border-[#222222] rounded-lg p-4">
                <p className="text-white/80 font-mono text-sm">
                  {this.state.error?.message || 'Unknown error'}
                </p>
              </div>
            </div>

            {/* Stack Trace (Collapsible) */}
            <div className="mb-6">
              <button
                onClick={this.toggleStackTrace}
                className="flex items-center justify-between w-full text-xs uppercase tracking-wider text-white/40 hover:text-white/60 transition-colors mb-2"
              >
                <span>Stack Trace</span>
                {this.state.showStackTrace ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {this.state.showStackTrace && (
                <div className="bg-[#0d0a1a] border border-[#222222] rounded-lg p-4 overflow-auto max-h-64">
                  <pre className="text-white/50 font-mono text-xs whitespace-pre-wrap">
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
            <div className="flex gap-4">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-6 py-3 bg-white text-[#0a0a0a] font-medium rounded-full hover:bg-white/90 transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-6 py-3 border border-[#222222] text-white font-medium rounded-full hover:bg-white/5 hover:border-[#333333] transition-all duration-300"
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
