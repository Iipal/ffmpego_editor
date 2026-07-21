'use client';

import { Toaster } from '@/components/ui/sonner';
import { MainDashboard } from '@/components/dashboard/main-dashboard';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <MainDashboard />
      <Toaster />
    </main>
  );
}
