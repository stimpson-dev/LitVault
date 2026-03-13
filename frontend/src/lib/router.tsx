import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReviewPage } from '@/pages/ReviewPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DocumentsPage activePanel={null} />,
      },
      {
        path: 'view/:viewId',
        element: <DocumentsPage activePanel={null} />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'review',
        element: <ReviewPage />,
      },
    ],
  },
]);
