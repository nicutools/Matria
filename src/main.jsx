import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(() => {
      // Warm cache with common drug searches in the background
      // Skip if user arrived with a deep link (they're already searching)
      if (!new URLSearchParams(window.location.search).get('drug')) {
        setTimeout(() => warmCommonDrugs(), 5000);
      }
    }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

async function warmCommonDrugs() {
  const drugs = [
    'Paracetamol', 'Sertraline', 'Levothyroxine', 'Ondansetron',
    'Metformin', 'Azithromycin', 'Amoxicillin', 'Ibuprofen',
  ];

  const { searchDrugs } = await import('./api/dailymed.js');

  for (const drug of drugs) {
    try {
      await searchDrugs(drug);
    } catch {
      // Silently skip failures
    }
    // 1s gap between drugs to avoid hammering OpenFDA
    await new Promise((r) => setTimeout(r, 1000));
  }
}
