'use client'

import React from 'react'

interface OnboardingErrorBoundaryProps {
  children: React.ReactNode
  fallback: React.ReactNode
}

interface OnboardingErrorBoundaryState {
  hasError: boolean
}

export class OnboardingErrorBoundary extends React.Component<
  OnboardingErrorBoundaryProps,
  OnboardingErrorBoundaryState
> {
  constructor(props: OnboardingErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): OnboardingErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[OnboardingErrorBoundary]', error, errorInfo)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}
