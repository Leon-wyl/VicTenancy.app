import { createLocalOrchestrationContext } from './modules/agent-orchestration/bootstrap';
import { AgentJobProcessor } from './modules/agent-orchestration/agent-job-processor';
import { DispatcherService } from './modules/agent-orchestration/dispatcher.service';
import { OutboxService } from './modules/agent-orchestration/outbox.service';

async function main() {
  console.log('Local worker: recovering expired leases and processing due jobs...');

  const ctx = await createLocalOrchestrationContext();

  try {
    const dispatcher = ctx.get(DispatcherService);
    const outbox = ctx.get(OutboxService);
    const processor = ctx.get(AgentJobProcessor);
    const recovered = await dispatcher.recoverExpiredLeases();
    const rows = await outbox.findDueOutboxRows(10);
    let processed = 0;
    for (const row of rows) {
      const claim = await outbox.claimForDispatch(row.agentJobId);
      if (!claim) continue;
      await outbox.markPublished(claim.outboxId, claim.dispatchLeaseToken);
      await processor.processJob(claim.agentJobId, claim.deliveryId);
      processed++;
    }
    console.log(
      `Local worker: processed ${processed}, recovered ${recovered}`,
    );
  } finally {
    await ctx.close();
  }
}

main().catch((error) => {
  console.error('Local worker failed:', error);
  process.exit(1);
});
