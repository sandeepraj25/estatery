import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import type { z } from 'zod';
import type { createLeadSchema } from '@estatery/shared';
import { PropertiesService } from '../properties/properties.service.js';
import { CrmService } from '../crm/crm.service.js';

type LeadInput = z.output<typeof createLeadSchema>;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectModel('Lead') private readonly leads: Model<any>,
    private readonly properties: PropertiesService,
    private readonly crm: CrmService,
  ) {}

  async create(tenantId: Types.ObjectId, input: LeadInput, meta: { ip: string; userAgent: string | null }) {
    // Honeypot tripped: pretend success so bots don't learn to adapt, but store nothing.
    if (input.website) {
      this.logger.warn(`Honeypot lead discarded (tenant ${tenantId})`);
      return { id: null, received: true };
    }

    let propertyId: Types.ObjectId | null = null;
    let agentId: Types.ObjectId | null = null;
    if (input.propertyId) {
      // The property must belong to *this* tenant; otherwise a lead could be attached cross-tenant.
      const property = await this.properties.existsPublic(tenantId, input.propertyId);
      if (!property) {
        throw new BadRequestException({ code: 'PROPERTY_NOT_FOUND', message: 'That property is no longer available.' });
      }
      propertyId = property._id;
      agentId = property.agentId;
    }

    const lead = await this.leads.create({
      tenantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      intent: input.intent,
      propertyId,
      agentId,
      preferredDate: input.preferredDate ?? null,
      budget: input.budget ?? null,
      source: input.source,
      consentAt: new Date(),
      meta: { ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    });
    // Timeline entry, optional round-robin assignment, and queued notification emails.
    // A failure here must never lose the enquiry itself, which is already saved.
    await this.crm.onNewLead(tenantId, lead._id).catch((e) => this.logger.error(`Lead follow-up failed: ${(e as Error).message}`));
    return { id: lead._id.toString(), received: true };
  }
}
