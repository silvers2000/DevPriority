'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught rendering error:', error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 py-12">
          <div className="w-12 h-12 rounded-xl bg-[#F85149]/10 border border-[#F85149]/20 flex items-center justify-center">
            <AlertTriangle size={20} className="text-[#F85149]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#E6EDF3] mb-1">Something went wrong</p>
            <p className="text-xs text-[#8B949E] max-w-xs">
              {this.state.error?.message ?? 'An unexpected error occurred while rendering.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#21262D] border border-[#30363D] text-sm text-[#E6EDF3] hover:border-[#F0A500]/30 hover:text-[#F0A500] transition"
          >
            <RefreshCw size={13} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
