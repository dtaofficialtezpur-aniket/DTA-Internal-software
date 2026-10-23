import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { DEPTS } from '@/lib/constants';
import type { Dept } from '@/lib/types';

export const dynamicParams = false;
export const generateStaticParams = () => DEPTS.map((dept) => ({ dept }));

export default async function DeptLayout({ children, params }: { children: ReactNode; params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return <AppShell dept={dept as Dept}>{children}</AppShell>;
}
