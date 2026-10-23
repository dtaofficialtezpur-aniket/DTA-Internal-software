import Link from 'next/link';

export const metadata = { title: 'Offline · DTA Tracker' };

export default function Offline() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold text-brand-dark">You're offline</h1>
      <p className="text-mute">This page isn't saved on your device yet. Your data is safe — open any page you've visited before, or reconnect and try again.</p>
      <Link href="/accounts/dashboard/" className="btn-pri">Go to dashboard</Link>
    </div>
  );
}
