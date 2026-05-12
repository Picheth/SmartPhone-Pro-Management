import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './auth/AuthContext.tsx';
import { app } from './lib/firebase';
import { getAnalytics } from "firebase/analytics";

// Only enable analytics in production
if (import.meta.env.PROD) {
  const analytics = getAnalytics(app);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
