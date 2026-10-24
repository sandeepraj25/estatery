import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, signIn } from './helpers.js';

let app: INestApplication;
let conn: Connection;
let password: string;
let close: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';

let mailbox: () => Promise<Array<{ to: string; subject: string; text: string }>>;
let drain: () => Promise<void>;

beforeAll(async () => {
  ({ app, conn, password, close } = await bootTestApp('crm'));
  const { MailService } = await import('../src/modules/mail/mail.service.js');
  const { QueueService } = await import('../src/modules/jobs/queue.service.js');
  mailbox = async () => app.get(MailService).outbox;
  drain = () => app.get(QueueService).drain();
});
afterAll(async () => close?.());

const submit = (body: Record<string, unknown>, host = A) =>
  request(app.getHttpServer()).post('/v1/leads').set('Host', host).set('X-Forwarded-For', `10.0.0.${Math.floor(Math.random() * 200)}`)
    .send({ email: 'visitor@example.com', phone: '+91 98200 11111', consent: true, ...body });
const leadId = async (name: string) => (await conn.collection('leads').findOne({ name }))!._id.toString();

describe('new enquiries', () => {
  it('records a timeline entry and emails the listing’s advisor and extra inboxes', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await owner.c.put('/v1/admin/crm/settings', { notifyEmails: ['sales@aurelia.example'], notifyAssignedAgent: true, roundRobin: false })).status).toBe(200);
    const glasshouse = await conn.collection('properties').findOne({ slug: 'the-glasshouse-alibaug' });
    const before = (await mailbox()).length;
    expect((await submit({ name: 'Notify Test', propertyId: glasshouse!._id.toString() })).status).toBe(201);
    await drain();
    const sent = (await mailbox()).slice(before);
    expect(sent.map((m) => m.to).sort()).toEqual(['kabir@aurelia.example', 'sales@aurelia.example']);
    expect(sent[0]!.subject).toContain('Notify Test');
    expect(sent[0]!.text).toMatch(/\/admin\/leads\/[a-f0-9]{24}/);
    const id = await leadId('Notify Test');
    const acts = await conn.collection('leadactivities').find({ leadId: (await conn.collection('leads').findOne({ name: 'Notify Test' }))!._id }).toArray();
    expect(acts.map((a) => a.type)).toEqual(expect.arrayContaining(['created', 'notified']));
    void id;
  });

  it('round-robin spreads unassigned enquiries across active advisors', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    await owner.c.put('/v1/admin/crm/settings', { notifyEmails: [], notifyAssignedAgent: false, roundRobin: true });
    await submit({ name: 'RR One' });
    await submit({ name: 'RR Two' });
    await drain();
    const [one, two] = await Promise.all([conn.collection('leads').findOne({ name: 'RR One' }), conn.collection('leads').findOne({ name: 'RR Two' })]);
    expect(one!.agentId).toBeTruthy();
    expect(two!.agentId).toBeTruthy();
    expect(String(one!.agentId)).not.toBe(String(two!.agentId));
    await owner.c.put('/v1/admin/crm/settings', { notifyEmails: [], notifyAssignedAgent: true, roundRobin: false });
  });

  it('notification settings: only owners/admins, emails validated', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    expect((await manager.c.get('/v1/admin/crm/settings')).status).toBe(403);
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await owner.c.put('/v1/admin/crm/settings', { notifyEmails: ['not-an-email'] })).status).toBe(400);
  });
});

describe('who can see and change leads', () => {
  it('agents only see and open their own leads', async () => {
    const kabir = await signIn(app, A, 'kabir@aurelia.example', password);
    const list = await kabir.c.get('/v1/admin/leads?limit=100');
    expect(list.body.scope).toBe('own');
    const kabirAgent = await conn.collection('agents').findOne({ name: 'Kabir Malhotra' });
    for (const l of list.body.items) expect(l.agentId).toBe(kabirAgent!._id.toString());
    const someoneElses = await conn.collection('leads').findOne({ agentId: { $ne: kabirAgent!._id }, tenantId: kabirAgent!.tenantId });
    expect((await kabir.c.get(`/v1/admin/leads/${someoneElses!._id}`)).status).toBe(404);
    expect((await kabir.c.post(`/v1/admin/leads/${someoneElses!._id}/status`, { status: 'contacted' })).status).toBe(404);
  });

  it('agents update their own leads but cannot reassign them', async () => {
    const kabir = await signIn(app, A, 'kabir@aurelia.example', password);
    const id = await leadId('Rohan Gupta');
    const r = await kabir.c.post(`/v1/admin/leads/${id}/status`, { status: 'contacted' });
    expect(r.status).toBe(200);
    expect(r.body.lead.status).toBe('contacted');
    expect(r.body.lead.firstContactedAt).toBeTruthy();
    expect(r.body.activity[0].type).toBe('status');
    expect((await kabir.c.post(`/v1/admin/leads/${id}/assign`, { agentId: null })).status).toBe(403);
  });

  it('support can read but not change; editors can’t see leads at all', async () => {
    const support = await signIn(app, A, 'support@aurelia.example', password);
    const id = await leadId('Sneha Iyer');
    expect((await support.c.get(`/v1/admin/leads/${id}`)).status).toBe(200);
    expect((await support.c.post(`/v1/admin/leads/${id}/notes`, { body: 'hi' })).status).toBe(403);
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    expect((await editor.c.get(`/v1/admin/leads/${id}`)).status).toBe(403);
    expect((await editor.c.get('/v1/admin/leads/board')).status).toBe(403);
  });

  it('another agency can’t open these leads', async () => {
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    expect((await banyan.c.get(`/v1/admin/leads/${await leadId('Sneha Iyer')}`)).status).toBe(404);
  });

  it('closing as lost needs a reason', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    const id = await leadId('Arjun Nair');
    expect((await manager.c.post(`/v1/admin/leads/${id}/status`, { status: 'lost' })).status).toBe(400);
    const ok = await manager.c.post(`/v1/admin/leads/${id}/status`, { status: 'lost', note: 'Bought through a friend' });
    expect(ok.body.lead.lostReason).toBe('Bought through a friend');
    expect(ok.body.lead.closedAt).toBeTruthy();
  });
});

describe('assignment, notes and reminders', () => {
  it('managers reassign; the new advisor is emailed', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    const id = await leadId('Pooja Shah');
    const detail = await manager.c.get(`/v1/admin/leads/${id}`);
    const kabir = detail.body.assignableAgents.find((a: { name: string }) => a.name === 'Kabir Malhotra');
    const before = (await mailbox()).length;
    const r = await manager.c.post(`/v1/admin/leads/${id}/assign`, { agentId: kabir.id });
    expect(r.body.lead.agent).toBe('Kabir Malhotra');
    await drain();
    const sent = (await mailbox()).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('kabir@aurelia.example');
    expect(sent[0]!.subject).toMatch(/assigned to you/);
    // Kabir can now see it.
    const k = await signIn(app, A, 'kabir@aurelia.example', password);
    expect((await k.c.get(`/v1/admin/leads/${id}`)).status).toBe(200);
  });

  it('can’t assign to another agency’s advisor', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    const banyanAgent = await conn.collection('agents').findOne({ name: 'Sanjay Bhatia' });
    const r = await manager.c.post(`/v1/admin/leads/${await leadId('Pooja Shah')}/assign`, { agentId: banyanAgent!._id.toString() });
    expect(r.status).toBe(400);
  });

  it('logged calls count as first contact; notes appear in the timeline', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    await submit({ name: 'Call Logger' });
    await drain();
    const id = await leadId('Call Logger');
    const r = await manager.c.post(`/v1/admin/leads/${id}/notes`, { body: 'Spoke for 10 minutes; wants 3 BHK near Powai.', kind: 'call' });
    expect(r.status).toBe(201);
    expect(r.body.activity[0]).toMatchObject({ type: 'call', actorName: 'Dev Menon' });
    expect(r.body.lead.firstContactedAt).toBeTruthy();
  });

  it('reminders: future only, self-only for agents, emailed once when due', async () => {
    const kabir = await signIn(app, A, 'kabir@aurelia.example', password);
    const id = await leadId('Rohan Gupta');
    expect((await kabir.c.post(`/v1/admin/leads/${id}/reminders`, { dueAt: new Date(Date.now() - 3600_000).toISOString(), note: 'past' })).status).toBe(400);
    const isha = await conn.collection('users').findOne({ email: 'isha@aurelia.example' });
    expect((await kabir.c.post(`/v1/admin/leads/${id}/reminders`, { dueAt: new Date(Date.now() + 3600_000).toISOString(), note: 'x', assigneeUserId: isha!._id.toString() })).status).toBe(403);
    const created = await kabir.c.post(`/v1/admin/leads/${id}/reminders`, { dueAt: new Date(Date.now() + 120_000).toISOString(), note: 'Send brochure' });
    expect(created.status).toBe(201);
    const rem = created.body.reminders.find((r: { note: string }) => r.note === 'Send brochure');
    expect(rem.assignee).toBe('Kabir Malhotra');

    await conn.collection('leadreminders').updateOne({ note: 'Send brochure' }, { $set: { dueAt: new Date(Date.now() - 1000) } });
    const { JobsService } = await import('../src/modules/jobs/jobs.service.js');
    const jobs = app.get(JobsService);
    const before = (await mailbox()).length;
    const sentNow = await jobs.scanReminders();
    await drain();
    expect(sentNow).toBeGreaterThanOrEqual(1);
    expect((await mailbox()).slice(before).some((m) => m.to === 'kabir@aurelia.example' && m.subject.includes('Send brochure'))).toBe(true);
    // Never sent twice.
    const count = (await mailbox()).length;
    await jobs.scanReminders();
    await drain();
    expect((await mailbox()).filter((m) => m.subject.includes('Send brochure'))).toHaveLength((await mailbox()).slice(0, count).filter((m) => m.subject.includes('Send brochure')).length);

    const mine = await kabir.c.get('/v1/admin/leads/reminders/mine');
    const r = mine.body.items.find((x: { note: string }) => x.note === 'Send brochure');
    expect(r.overdue).toBe(true);
    const done = await kabir.c.patch(`/v1/admin/leads/reminders/${r.id}`, { done: true });
    expect(done.status).toBe(200);
  });
});

describe('export and erasure', () => {
  it('managers export CSV (formula-safe); agents and support cannot', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    await submit({ name: '=cmd|calc!A1' });
    await drain();
    const res = await request(app.getHttpServer()).get('/v1/admin/leads/export.csv').set('Host', A).set('Cookie', manager.jar.header());
    expect(res.status).toBe(200);
    expect(res.text.split('\n')[0]).toContain('received,name,email,phone,stage');
    expect(res.text).not.toMatch(/(^|,)=cmd/m);
    for (const email of ['kabir@aurelia.example', 'support@aurelia.example']) {
      const { jar } = await signIn(app, A, email, password);
      expect((await request(app.getHttpServer()).get('/v1/admin/leads/export.csv').set('Host', A).set('Cookie', jar.header())).status).toBe(403);
    }
  });

  it('owners can permanently erase a lead and its history; the audit log keeps no personal data', async () => {
    const id = await leadId('Lata Krishnan');
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    expect((await manager.c.del(`/v1/admin/leads/${id}`)).status).toBe(403);
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await owner.c.del(`/v1/admin/leads/${id}`)).status).toBe(204);
    expect(await conn.collection('leads').countDocuments({ name: 'Lata Krishnan' })).toBe(0);
    expect(await conn.collection('leadactivities').countDocuments({ leadId: id })).toBe(0);
    const audit = await conn.collection('auditlogs').findOne({ action: 'lead.erased' });
    expect(audit!.summary).not.toContain('Lata');
    expect(audit!.summary).not.toContain('Krishnan');
  });

  it('pipeline board groups open leads by stage', async () => {
    const manager = await signIn(app, A, 'manager@aurelia.example', password);
    const b = await manager.c.get('/v1/admin/leads/board');
    expect(b.body.columns.map((c: { status: string }) => c.status)).toEqual(['new', 'contacted', 'qualified', 'site-visit', 'negotiation']);
    const total = b.body.columns.reduce((n: number, c: { total: number }) => n + c.total, 0);
    expect(total).toBeGreaterThan(3);
  });
});
