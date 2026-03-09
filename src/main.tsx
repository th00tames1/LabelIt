import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useProjectStore } from './store/projectStore'
import { useImageStore } from './store/imageStore'
import { useLabelStore } from './store/labelStore'
import { useAnnotationStore } from './store/annotationStore'
import { useUIStore } from './store/uiStore'
import { useSettingsStore } from './store/settingsStore'

// Expose stores to window for CDP-based testing
;(window as unknown as Record<string, unknown>).__stores = {
  project: useProjectStore,
  image: useImageStore,
  label: useLabelStore,
  annotation: useAnnotationStore,
  ui: useUIStore,
  settings: useSettingsStore,
}

useSettingsStore.getState().load().finally(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
