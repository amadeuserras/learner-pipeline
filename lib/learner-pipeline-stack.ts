import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export class LearnerPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const resultsTable = new dynamodb.Table(this, 'ResultsTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const processedEventsTable = new dynamodb.Table(this, 'ProcessedEventsTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const eventsQueue = new sqs.Queue(this, 'EventsQueue');

    const ingestFn = new NodejsFunction(this, 'IngestFn', {
      entry: path.join(__dirname, '../lambda/ingest.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { QUEUE_URL: eventsQueue.queueUrl },
    });

    eventsQueue.grantSendMessages(ingestFn);
  }
}
