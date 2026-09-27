import Link from 'next/link';
import { Logo } from '@schovexa/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo showTagline size={44} />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
