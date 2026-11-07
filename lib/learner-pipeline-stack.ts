import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
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

    const processFn = new NodejsFunction(this, 'ProcessFn', {
      entry: path.join(__dirname, '../lambda/process.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        PROCESSED_TABLE: processedEventsTable.tableName,
        RESULTS_TABLE: resultsTable.tableName,
      },
    });

    processFn.addEventSource(new SqsEventSource(eventsQueue));
    processedEventsTable.grantReadWriteData(processFn);
    resultsTable.grantReadWriteData(processFn);

    const api = new apigwv2.HttpApi(this, 'EventsApi');

    api.addRoutes({
      path: '/events',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('IngestIntegration', ingestFn),
    });

    const readFn = new NodejsFunction(this, 'ReadFn', {
      entry: path.join(__dirname, '../lambda/read.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { RESULTS_TABLE: resultsTable.tableName },
    });

    resultsTable.grantReadData(readFn);

    api.addRoutes({
      path: '/learners/{learnerId}/progress',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ReadIntegration', readFn),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
