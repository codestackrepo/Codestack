import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { ClerkAppProvider } from '@/features/auth/clerk/clerk-app-provider';
import { queryClient } from '@/lib/query-client';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {/* Clerk mode when VITE_CLERK_PUBLISHABLE_KEY is set; legacy cookie
              AuthProvider otherwise (#59). ClerkProvider needs to sit under
              ThemeProvider so its appearance can follow light/dark. */}
          <ClerkAppProvider>
            <App />
            <Toaster richColors position="top-right" />
          </ClerkAppProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
