import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { LearnerEventSchema } from './schemas';

const sqs = new SQSClient({});

const bad = (error: unknown): APIGatewayProxyResultV2 => ({
  statusCode: 400,
  body: JSON.stringify({ error }),
});

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  let json: unknown;
  try {
    json = event.body ? JSON.parse(event.body) : null;
  } catch {
    return bad('body must be valid JSON');
  }

  const parsed = LearnerEventSchema.safeParse(json);
  if (!parsed.success) return bad(z.flattenError(parsed.error).fieldErrors);

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(parsed.data),
    }),
  );

  return { statusCode: 202, body: JSON.stringify({ queued: parsed.data.id }) };
};
