import { Logger } from '@aws-lambda-powertools/logger';

// One shared logger. Every log line is JSON and includes the function name and request ID.
export const logger = new Logger({ serviceName: 'learner-pipeline' });
