import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { SubmissionStatusEvent, SubmissionTestcaseEvent } from '@/types/submission';

/**
 * Live judge progress over the /ws/submissions gateway. A fresh socket per
 * submissionId (submissions are rate-limited to 1/min, so reconnect overhead
 * is negligible) — simpler than tracking subscribe/unsubscribe across a
 * shared persistent connection. Relies on the httpOnly access_token cookie
 * being sent automatically on the same-origin/credentialed handshake — there
 * is no token to read from JS.
 */
export function useSubmissionSocket(submissionId: string | null) {
  const [subscribedId, setSubscribedId] = useState(submissionId);
  const [status, setStatus] = useState<SubmissionStatusEvent | null>(null);
  const [testcaseVerdicts, setTestcaseVerdicts] = useState<Record<number, SubmissionTestcaseEvent>>(
    {},
  );

  // Reset local state during render when the submission changes, rather than
  // via setState at the top of the effect below.
  if (submissionId !== subscribedId) {
    setSubscribedId(submissionId);
    setStatus(null);
    setTestcaseVerdicts({});
  }

  useEffect(() => {
    if (!submissionId) return;

    const socket = io('/ws/submissions', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('subscribe', { submissionId });
    });

    socket.on('submission.status', (payload: SubmissionStatusEvent) => {
      if (payload.submissionId === submissionId) setStatus(payload);
    });

    socket.on('submission.testcase', (payload: SubmissionTestcaseEvent) => {
      if (payload.submissionId === submissionId) {
        setTestcaseVerdicts((prev) => ({ ...prev, [payload.ordinal]: payload }));
      }
    });

    return () => {
      socket.emit('unsubscribe', { submissionId });
      socket.disconnect();
    };
  }, [submissionId]);

  return { status, testcaseVerdicts };
}
