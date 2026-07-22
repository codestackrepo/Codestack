import { Assignment } from './assignment.entity';
import { AssignmentStatus } from '../enums/assignment-status.enum';

describe('Assignment.applyTimeTransition', () => {
  function makeAssignment(status: AssignmentStatus, startDate: Date, endDate: Date): Assignment {
    const a = new Assignment();
    a.status = status;
    a.startDate = startDate;
    a.endDate = endDate;
    return a;
  }

  const past = (hours: number) => new Date(Date.now() - hours * 3_600_000);
  const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  it('transitions SCHEDULED -> ACTIVE once the start date has passed and end has not', () => {
    const a = makeAssignment(AssignmentStatus.SCHEDULED, past(1), future(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(true);
    expect(a.status).toBe(AssignmentStatus.ACTIVE);
  });

  it('does NOT transition SCHEDULED before its start date', () => {
    const a = makeAssignment(AssignmentStatus.SCHEDULED, future(1), future(2));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(false);
    expect(a.status).toBe(AssignmentStatus.SCHEDULED);
  });

  it('transitions ACTIVE -> COMPLETED once the end date has passed', () => {
    const a = makeAssignment(AssignmentStatus.ACTIVE, past(2), past(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(true);
    expect(a.status).toBe(AssignmentStatus.COMPLETED);
  });

  it('does NOT transition ACTIVE before its end date', () => {
    const a = makeAssignment(AssignmentStatus.ACTIVE, past(1), future(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(false);
    expect(a.status).toBe(AssignmentStatus.ACTIVE);
  });

  it('never auto-transitions DRAFT regardless of dates (must be published explicitly)', () => {
    const a = makeAssignment(AssignmentStatus.DRAFT, past(1), future(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(false);
    expect(a.status).toBe(AssignmentStatus.DRAFT);
  });

  it('never auto-transitions a DRAFT assignment even after its end date', () => {
    const a = makeAssignment(AssignmentStatus.DRAFT, past(2), past(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(false);
    expect(a.status).toBe(AssignmentStatus.DRAFT);
  });

  it('never auto-transitions GRADE_PUBLISHED (terminal state)', () => {
    const a = makeAssignment(AssignmentStatus.GRADE_PUBLISHED, past(2), past(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(false);
    expect(a.status).toBe(AssignmentStatus.GRADE_PUBLISHED);
  });

  it('does not transition COMPLETED any further', () => {
    const a = makeAssignment(AssignmentStatus.COMPLETED, past(2), past(1));
    const changed = a.applyTimeTransition(new Date());
    expect(changed).toBe(false);
    expect(a.status).toBe(AssignmentStatus.COMPLETED);
  });
});
