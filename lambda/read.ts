import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const learnerId = event.pathParameters?.learnerId;
  const topic = event.queryStringParameters?.topic;

  if (!learnerId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'learnerId is required' }) };
  }

  // Learner only -> OVERALL item. Learner + topic -> TOPIC item.
  const { Item } = await db.send(
    new GetCommand({
      TableName: process.env.RESULTS_TABLE,
      Key: {
        PK: `LEARNER#${learnerId}`,
        SK: topic ? `TOPIC#${topic}` : 'OVERALL',
      },
    }),
  );

  if (!Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'no progress found' }) };
  }

  const { avgScore, bestScore, count } = Item;
  return { statusCode: 200, body: JSON.stringify({ learnerId, topic, avgScore, bestScore, count }) };
};
