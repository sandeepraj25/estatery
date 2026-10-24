import { Module } from '@nestjs/common';
import { DnsService } from './dns.service.js';
import { DomainRecheckService } from './domain-recheck.service.js';
import { DomainsController, RoutingController, TlsAskController } from './domains.controller.js';
import { DomainsService } from './domains.service.js';

@Module({
  controllers: [DomainsController, RoutingController, TlsAskController],
  providers: [DnsService, DomainsService, DomainRecheckService],
  exports: [DomainsService, DnsService, DomainRecheckService],
})
export class DomainsModule {}
