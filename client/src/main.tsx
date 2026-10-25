import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import './index.css';
import { Spinner } from './components/ui';

const Home = lazy(() => import('./pages/Home'));
const Vote = lazy(() => import('./pages/Vote'));
const Hall = lazy(() => import('./pages/Hall'));
const Admin = lazy(() => import('./pages/Admin'));
const Guide = lazy(() => import('./pages/Guide'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/s/:slug" element={<Vote />} />
            <Route path="/hall/:slug" element={<Hall />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/guide" element={<Guide />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
