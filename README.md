# Learner Activity Pipeline

A serverless pipeline on AWS. It takes learner activity events, processes them in the background, and serves progress results. It is written in TypeScript and deployed with AWS CDK.

## Architecture

```
POST /events ──> Ingest Lambda ──> SQS queue ──> Process Lambda ──> DynamoDB
                                       │                              ▲
                                       └─(3 failures)─> DLQ           │
                                                                      │
GET /learners/{learnerId}/progress ──> Read Lambda ───────────────────┘
```

1. **Ingest.** API Gateway (HTTP API) calls a Lambda. The Lambda validates the event with Zod. It then puts the event on SQS.
2. **Process.** A second Lambda reads from SQS. It updates the learner's scores in DynamoDB.
3. **Read.** A third Lambda reads the scores from DynamoDB.

The queue splits ingest from processing. The API answers fast. A traffic spike waits in the queue. A failed message retries instead of getting lost.

## Event format

```json
{
  "id": "evt-001",
  "learnerId": "123",
  "topic": "fractions",
  "lesson": "adding-fractions",
  "score": 85,
  "submittedAt": "2026-11-07T10:00:00Z"
}
```

All fields are required. `score` is a number from 0 to 100. `submittedAt` is an ISO 8601 timestamp.

## DynamoDB design

I wrote the access patterns first. The tables follow them.

**ResultsTable** holds derived scores.

| PK            | SK                | avgScore | bestScore | count |
| ------------- | ----------------- | -------- | --------- | ----- |
| `LEARNER#123` | `TOPIC#fractions` | 80       | 95        | 3     |
| `LEARNER#123` | `TOPIC#algebra`   | 70       | 90        | 2     |
| `LEARNER#123` | `OVERALL`         | 76       | 95        | 5     |

One learner has one partition. A single `GetItem` returns either the topic scores or the overall scores.

**ProcessedEventsTable** holds the IDs of events already handled (`PK = EVENT#<id>`). The process Lambda checks this table first. This makes processing idempotent. SQS can deliver a message twice, and the scores still count once.

## API

**Send an event**

```sh
curl -X POST "$API_URL/events" \
  -H "content-type: application/json" \
  -d '{"id":"evt-001","learnerId":"123","topic":"fractions","lesson":"adding-fractions","score":85,"submittedAt":"2026-11-07T10:00:00Z"}'
```

**Read progress**

```sh
# Overall scores
curl "$API_URL/learners/123/progress"

# Scores for one topic
curl "$API_URL/learners/123/progress?topic=fractions"
```

The read endpoint returns `404` if the learner has no data. It returns `400` for bad input.

## Failure handling and observability

- A message that fails 3 times moves to a dead-letter queue (DLQ). The DLQ keeps messages for 14 days.
- A CloudWatch alarm fires when the DLQ has one or more messages.
- Lambdas write structured logs with Powertools Logger. Log groups keep logs for 7 days.

## Project layout

```
bin/        CDK app entry point
lib/        CDK stack (all AWS resources)
lambda/     ingest, process, and read handlers, plus Zod schemas and logger
test/       Jest tests
docs/       Notes and spec
```

## Getting started

You need Node.js 22+, an AWS account, and configured AWS credentials.

```sh
npm install
npm test                 # run unit tests
npx cdk bootstrap        # first time only
npx cdk deploy           # deploy the stack
```

`cdk deploy` prints the `ApiUrl` output. Use it as `API_URL` in the examples above.

To remove everything, run `npx cdk destroy`.

## Status

- [x] CDK skeleton and ingest endpoint
- [x] Queue, processor, and DynamoDB
- [x] Read endpoint
- [x] DLQ alarm and structured logs
- [x] Unit tests for the process handler
- [ ] X-Ray tracing
- [ ] DLQ replay
- [ ] Integration tests and CI

## Design trade-offs

- **SQS between ingest and processing.** It adds a little delay. In return, the API stays fast and no data is lost during failures.
- **Two items per event (topic and overall).** Reads are one cheap `GetItem`. Writes cost more, because each event updates two items.
- **Pay-per-request DynamoDB.** It costs almost nothing at low traffic. At high, steady traffic, provisioned capacity would be cheaper.
- **Separate idempotency table.** It keeps the results table clean.
