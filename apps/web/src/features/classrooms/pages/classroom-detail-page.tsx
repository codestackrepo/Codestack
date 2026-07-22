import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { classroomsApi } from '../api/classrooms.api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function MemberRow({ member }: { member: Member }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar className="size-8">
        <AvatarFallback>{initials(member.firstName, member.lastName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {member.firstName} {member.lastName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
    </li>
  );
}

export function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: classroom, isLoading } = useQuery({
    queryKey: ['classrooms', id],
    queryFn: () => classroomsApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!classroom) return null;

  const students = (classroom.students ?? []) as Member[];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/home/classrooms">
          <ArrowLeft className="size-4" /> Back to classrooms
        </Link>
      </Button>

      <div className="flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row sm:items-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GraduationCap className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{classroom.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{classroom.courseId}</Badge>
            <Badge variant="outline">{classroom.term}</Badge>
            <Badge variant="outline">
              {classroom.totalUsers} member{classroom.totalUsers === 1 ? '' : 's'}
            </Badge>
            {classroom.professor && (
              <Badge variant="outline">
                Prof. {classroom.professor.firstName} {classroom.professor.lastName}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {classroom.description && (
        <p className="text-sm leading-relaxed text-muted-foreground">{classroom.description}</p>
      )}

      {students.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {students.map((s) => (
                <MemberRow key={s.id} member={s} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
