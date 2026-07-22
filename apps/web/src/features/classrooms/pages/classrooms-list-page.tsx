import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Users } from 'lucide-react';
import { classroomsApi } from '../api/classrooms.api';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ClassroomsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['classrooms', 'list'],
    queryFn: () => classroomsApi.list(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classrooms"
        description="Courses you teach, grade, or are enrolled in."
      />

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && data?.data.length === 0 && (
        <EmptyState
          title="No classrooms yet"
          description="Classrooms you're enrolled in or teaching will show up here."
        />
      )}

      {!isLoading && data && data.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((classroom) => (
            <Link key={classroom.id} to={`/home/classrooms/${classroom.id}`} className="group">
              <Card className="h-full transition-all group-hover:ring-primary/30 group-hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <GraduationCap className="size-5" />
                    </span>
                    <Badge variant="secondary">{classroom.term}</Badge>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-heading font-semibold leading-snug transition-colors group-hover:text-primary">
                      {classroom.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{classroom.courseId}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    {classroom.totalUsers} member{classroom.totalUsers === 1 ? '' : 's'}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
