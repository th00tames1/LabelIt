import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Canvas render failed', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 24,
            color: '#fecaca',
            background: '#120808',
            textAlign: 'center',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {`Canvas failed to render.\n\n${this.state.error.message}`}
        </div>
      )
    }

    return this.props.children
  }
}
