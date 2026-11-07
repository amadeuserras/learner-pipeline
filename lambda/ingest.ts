import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const sqs = new SQSClient({});

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

const isIsoTimestamp = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));

const bad = (error: string): APIGatewayProxyResultV2 => ({
  statusCode: 400,
  body: JSON.stringify({ error }),
});

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  let body: any;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return bad('body must be valid JSON');
  }

  if (!body) return bad('body is required');

  for (const field of ['id', 'learnerId', 'topic', 'lesson']) {
    if (!isNonEmptyString(body[field])) return bad(`${field} must be a non-empty string`);
  }
  if (typeof body.score !== 'number' || body.score < 0 || body.score > 100) {
    return bad('score must be a number from 0 to 100');
  }
  if (!isIsoTimestamp(body.submittedAt)) return bad('submittedAt must be an ISO 8601 timestamp');

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(body),
    }),
  );

  return { statusCode: 202, body: JSON.stringify({ queued: body.id }) };
};
