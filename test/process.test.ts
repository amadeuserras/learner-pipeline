import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { SQSEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

const db = mockClient(DynamoDBDocumentClient);
let handler: (event: SQSEvent) => Promise<void>;

beforeAll(() => {
  // The handler reads these when it loads, so set them before loading it.
  process.env.RESULTS_TABLE = 'results';
  process.env.PROCESSED_TABLE = 'processed';
  process.env.POWERTOOLS_LOG_LEVEL = 'SILENT';
  handler = require('../lambda/process').handler;
});

beforeEach(() => {
  db.reset();
  db.on(GetCommand).resolves({}); // by default, nothing exists yet
  db.on(PutCommand).resolves({});
});

const learnerEvent = {
  id: 'e1',
  learnerId: 'a',
  topic: 'fractions',
  lesson: 'l1',
  score: 80,
  submittedAt: '2026-11-07T21:00:00Z',
};

const sqsEvent = (body: object): SQSEvent =>
  ({ Records: [{ body: JSON.stringify(body) }] }) as SQSEvent;

const putItems = () => db.commandCalls(PutCommand).map((c) => c.args[0].input);

describe('process handler', () => {
  test('first event creates the topic and overall items', async () => {
    await handler(sqsEvent(learnerEvent));

    expect(putItems()).toContainEqual({
      TableName: 'results',
      Item: { PK: 'LEARNER#a', SK: 'TOPIC#fractions', avgScore: 80, bestScore: 80, count: 1 },
    });
    expect(putItems()).toContainEqual({
      TableName: 'results',
      Item: { PK: 'LEARNER#a', SK: 'OVERALL', avgScore: 80, bestScore: 80, count: 1 },
    });
  });

  test('second event updates the average, best score and count', async () => {
    const existing = { avgScore: 80, bestScore: 80, count: 1 };
    db.on(GetCommand, { TableName: 'results', Key: { PK: 'LEARNER#a', SK: 'TOPIC#fractions' } })
      .resolves({ Item: { PK: 'LEARNER#a', SK: 'TOPIC#fractions', ...existing } });
    db.on(GetCommand, { TableName: 'results', Key: { PK: 'LEARNER#a', SK: 'OVERALL' } })
      .resolves({ Item: { PK: 'LEARNER#a', SK: 'OVERALL', ...existing } });

    await handler(sqsEvent({ ...learnerEvent, id: 'e2', score: 100 }));

    expect(putItems()).toContainEqual({
      TableName: 'results',
      Item: { PK: 'LEARNER#a', SK: 'TOPIC#fractions', avgScore: 90, bestScore: 100, count: 2 },
    });
  });

  test('records the event ID as processed', async () => {
    await handler(sqsEvent(learnerEvent));

    expect(putItems()).toContainEqual({ TableName: 'processed', Item: { PK: 'EVENT#e1' } });
  });

  test('skips a duplicate event without writing anything', async () => {
    db.on(GetCommand, { TableName: 'processed', Key: { PK: 'EVENT#e1' } })
      .resolves({ Item: { PK: 'EVENT#e1' } });

    await handler(sqsEvent(learnerEvent));

    expect(db.commandCalls(PutCommand)).toHaveLength(0);
  });
});
