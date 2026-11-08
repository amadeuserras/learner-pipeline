import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { SQSEvent } from 'aws-lambda';
import { logger } from './logger';
import { LearnerEventSchema, StatsSchema, type Stats } from './schemas';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RESULTS = process.env.RESULTS_TABLE;
const PROCESSED = process.env.PROCESSED_TABLE;

const EMPTY_STATS: Stats = { avgScore: 0, bestScore: 0, count: 0 };

// Read one results item. If it does not exist yet, start from zero.
const readStats = async (PK: string, SK: string): Promise<Stats> => {
  const { Item } = await db.send(new GetCommand({ TableName: RESULTS, Key: { PK, SK } }));
  return Item ? StatsSchema.parse(Item) : EMPTY_STATS;
};

// Fold one new score into the stats.
const addScore = (s: Stats, score: number): Stats => ({
  avgScore: (s.avgScore * s.count + score) / (s.count + 1),
  bestScore: Math.max(s.bestScore, score),
  count: s.count + 1,
});

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const { id, learnerId, topic, score } = LearnerEventSchema.parse(JSON.parse(record.body));
    const PK = `LEARNER#${learnerId}`;

    // 1.1 Idempotency check: skip if we already processed this event.
    const seen = await db.send(new GetCommand({ TableName: PROCESSED, Key: { PK: `EVENT#${id}` } }));
    if (seen.Item) {
      logger.info('duplicate event skipped', { eventId: id });
      continue;
    }

    // 2. Read the two items that depend on this event.
    const topicStats = await readStats(PK, `TOPIC#${topic}`);
    const overallStats = await readStats(PK, 'OVERALL');

    // 3. Compute the updated items.
    const newTopic = addScore(topicStats, score);
    const newOverall = addScore(overallStats, score);

    // 4. Write the items back to Results.
    await db.send(new PutCommand({ TableName: RESULTS, Item: { PK, SK: `TOPIC#${topic}`, ...newTopic } }));
    await db.send(new PutCommand({ TableName: RESULTS, Item: { PK, SK: 'OVERALL', ...newOverall } }));

    // 5. Write the eventId to the processed table.
    await db.send(new PutCommand({ TableName: PROCESSED, Item: { PK: `EVENT#${id}` } }));
    logger.info('event processed', { eventId: id, learnerId, topic });
  }
};
