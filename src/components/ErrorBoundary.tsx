import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackView?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-deep)',
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        <p style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          something flickered in the void
        </p>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, maxWidth: '400px' }}>
          {this.state.error?.message || 'an unexpected error occurred'}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="clay-button"
          style={{ marginTop: '1.5rem', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
        >
          try again
        </button>
      </div>
    )
  }
}
