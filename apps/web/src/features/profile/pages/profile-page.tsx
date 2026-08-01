import type { ComponentType, ReactNode } from 'react';
import { BadgeCheck, Hash, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/context/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';
import { accentChip } from '@/lib/accents';
import { Role } from '@/types/common';
import { GamificationPanel } from '@/features/gamification/components/gamification-panel';

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

const ROLE_BLURB: Record<string, string> = {
  admin: 'Full platform administration access.',
  professor: 'Teaches classrooms and authors assignments.',
  student: 'Learning by solving problems.',
};

function DetailCard({
  icon: Icon,
  accent,
  label,
  value,
  mono,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: string;
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <Card className="hover-lift flex items-center gap-3.5 p-4">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={accentChip(accent)}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p
          className={cn(
            'truncate text-sm font-medium text-foreground',
            mono && 'font-mono text-xs',
          )}
        >
          {value}
        </p>
      </div>
    </Card>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const isStudent = user.role === Role.STUDENT;

  return (
    <div className={cn('space-y-6', isStudent ? 'max-w-7xl' : 'max-w-7xl')}>
      <PageHeader title="Profile" description="Your account details and activity." />

      {/* Identity banner: gradient header with an overlapping avatar. */}
      <Card className="overflow-hidden p-0 w-full">
        <div className="bg-gradient-brand relative h-28">
          <div className="glow-violet absolute inset-0 opacity-40" aria-hidden />
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar className="size-24 shrink-0 ring-4 ring-card">
              <AvatarFallback className="bg-linear-to-br from-primary to-[#8b5cf6] text-2xl font-bold text-white">
                {initials(user.firstName, user.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 sm:mb-1.5">
              <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {user.firstName} {user.lastName}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {user.role}
                </Badge>
                <span className="text-sm text-muted-foreground">{ROLE_BLURB[user.role]}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Colourful account details. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailCard icon={Mail} accent="#0ea5e9" label="Email" value={user.email} />
        <DetailCard
          icon={ShieldCheck}
          accent="#8b5cf6"
          label="Role"
          value={<span className="capitalize">{user.role}</span>}
        />
        <DetailCard icon={Hash} accent="#14b8a6" label="User ID" value={user.id} mono />
        <DetailCard icon={BadgeCheck} accent="#10b981" label="Status" value="Active" />
      </div>

      {isStudent && <GamificationPanel />}
    </div>
  );
}
