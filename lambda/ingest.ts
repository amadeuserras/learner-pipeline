import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const sqs = new SQSClient({});

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const body = event.body ? JSON.parse(event.body) : null;

  if (!body?.eventId || !body?.learnerId || !body?.topic) {
    return { statusCode: 400, body: JSON.stringify({ error: 'eventId, learnerId and topic are required' }) };
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(body),
    }),
  );

  return { statusCode: 202, body: JSON.stringify({ queued: body.eventId }) };
};
t