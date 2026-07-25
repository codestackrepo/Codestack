import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Webhook } from 'svix'; // REAL svix here — this file deliberately does not mock it.
import { WebhookEvent } from '../billing/entities/webhook-event.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { OrgInvite } from './entities/org-invite.entity';
import { ClerkWebhookService, ClerkWebhookSignatureError } from './clerk-webhook.service';

// A syntactically valid svix secret (whsec_ + base64). Test-only.
const SECRET = 'whsec_' + Buffer.from('codestack-test-signing-secret-01').toString('base64');

function build() {
  const users = { deactivateByClerkId: jest.fn().mockResolvedValue(undefined) };
  const orgs = {};
  const events = {
    create: jest.fn((d) => d),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const invites = {};
  const config = { get: jest.fn(() => ({ webhookSigningSecret: SECRET })) };
  const svc = new ClerkWebhookService(
    config as unknown as ConfigService,
    users as unknown as UsersService,
    orgs as unknown as OrganizationsService,
    events as unknown as Repository<WebhookEvent>,
    invites as unknown as Repository<OrgInvite>,
  );
  return { svc, users, events };
}

/** Produce genuinely svix-signed headers for a payload, with a current timestamp. */
function sign(payload: string) {
  const wh = new Webhook(SECRET);
  const now = new Date();
  const id = 'msg_sig_test';
  const signature = wh.sign(id, now, payload);
  return { id, timestamp: Math.floor(now.getTime() / 1000).toString(), signature };
}

describe('ClerkWebhookService — real svix signature verification', () => {
  it('accepts a genuinely-signed payload and dispatches it', async () => {
    const { svc, users, events } = build();
    const payload = JSON.stringify({ type: 'user.deleted', data: { id: 'user_del_1' } });
    await svc.handle(Buffer.from(payload), sign(payload));
    expect(users.deactivateByClerkId).toHaveBeenCalledWith('user_del_1');
    expect(events.save).toHaveBeenCalled();
  });

  it('rejects a payload whose body was tampered after signing', async () => {
    const { svc, users } = build();
    const original = JSON.stringify({ type: 'user.deleted', data: { id: 'user_del_1' } });
    const headers = sign(original);
    const tampered = JSON.stringify({ type: 'user.deleted', data: { id: 'attacker' } });
    await expect(svc.handle(Buffer.from(tampered), headers)).rejects.toBeInstanceOf(
      ClerkWebhookSignatureError,
    );
    expect(users.deactivateByClerkId).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    const { svc } = build();
    const payload = JSON.stringify({ type: 'user.deleted', data: { id: 'user_del_1' } });
    await expect(
      svc.handle(Buffer.from(payload), {
        id: 'msg_x',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: 'v1,Zm9yZ2VkIHNpZ25hdHVyZQ==',
      }),
    ).rejects.toBeInstanceOf(ClerkWebhookSignatureError);
  });
});
