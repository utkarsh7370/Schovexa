import Link from 'next/link';
import { Logo } from '@schovexa/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo showTagline size={44} />
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs text-slate-400">
        <Link href="/privacy-policy" className="hover:text-slate-600 hover:underline">
          Privacy Policy
        </Link>
        {' · '}
        <Link href="/terms-of-service" className="hover:text-slate-600 hover:underline">
          Terms of Service
        </Link>
      </p>
    </main>
  );
}
