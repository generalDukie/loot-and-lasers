import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from '@/App.jsx'
import '@/index.css'
import { ANIM_FPS } from '@/lib/animFps'

// Align Framer Motion / CSS animation sampling with a 120 Hz target.
// Browsers still vsync to the display; this keeps springs/tweens from
// artificially undersampling on high-refresh panels.
if (typeof window !== 'undefined') {
  window.__LOOT_ANIM_FPS__ = ANIM_FPS
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>
)
