import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput,
} from '@aws-sdk/client-sqs';

export interface QueueMessagePayload {
  version: number;
  jobId: string;
  conversationId: string;
  deliveryId: string;
}

export class SqsClient {
  private readonly client: SQSClient;
  private readonly queueUrl: string | undefined;

  constructor() {
    this.queueUrl = process.env.SQS_MAIN_QUEUE_URL;
    if (this.queueUrl) {
      this.client = new SQSClient({});
    } else {
      this.client = undefined as unknown as SQSClient;
    }
  }

  isConfigured(): boolean {
    return !!this.queueUrl;
  }

  async sendMessage(payload: QueueMessagePayload): Promise<void> {
    if (!this.queueUrl) {
      throw new Error('SQS_MAIN_QUEUE_URL is not configured');
    }

    const body = JSON.stringify(payload);
    const input: SendMessageCommandInput = {
      QueueUrl: this.queueUrl,
      MessageBody: body,
      MessageGroupId: payload.conversationId,
      MessageDeduplicationId: payload.deliveryId,
    };

    await this.client.send(new SendMessageCommand(input));
  }
}
