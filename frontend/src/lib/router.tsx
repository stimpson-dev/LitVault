import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { DocumentDetailPage } from '@/components/detail/DocumentDetailPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DocumentsPage />,
      },
      {
        path: 'view/:viewId',
        element: <DocumentsPage />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'review',
        element: <ReviewPage />,
      },
      {
        path: 'documents/:id',
        element: <DocumentDetailPage />,
      },
    ],
  },
]);
