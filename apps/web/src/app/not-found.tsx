import type { Metadata } from 'next';
import { NotFoundPage } from '../components/not-found-page';

export const metadata: Metadata = { title: 'Page not found · Schovexa' };

export default function NotFound() {
  return <NotFoundPage />;
}
