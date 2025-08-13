import React from 'react'
import { createRoot } from 'react-dom/client'
import { EuiProvider } from '@elastic/eui'
import App from './ui/App'

// EUI v106 uses Emotion for CSS-in-JS - no separate CSS imports needed

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EuiProvider colorMode="dark">
      <App />
    </EuiProvider>
  </React.StrictMode>
)
