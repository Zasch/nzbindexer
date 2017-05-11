import * as bunyan from 'bunyan';
import { config } from '../config';

export const logger: bunyan = bunyan.createLogger(config.logger);
