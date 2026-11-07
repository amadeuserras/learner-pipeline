import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { ProgressRequestSchema, StatsSchema, type ProgressResponse } from './schemas';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const parsed = ProgressRequestSchema.safeParse({
    learnerId: event.pathParameters?.learnerId,
    topic: event.queryStringParameters?.topic,
  });
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ error: z.flattenError(parsed.error).fieldErrors }) };
  }
  const { learnerId, topic } = parsed.data;

  // Learner only -> OVERALL item. Learner + topic -> TOPIC item.
  const { Item } = await db.send(
    new GetCommand({
      TableName: process.env.RESULTS_TABLE,
      Key: { PK: `LEARNER#${learnerId}`, SK: topic ? `TOPIC#${topic}` : 'OVERALL' },
    }),
  );

  if (!Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'no progress found' }) };
  }

  const response: ProgressResponse = { learnerId, topic, ...StatsSchema.parse(Item) };
  return { statusCode: 200, body: JSON.stringify(response) };
};
