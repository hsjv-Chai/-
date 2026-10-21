import {env as workerEnv} from 'cloudflare:workers';
import type {Storage} from './storage-contract';
export const env=workerEnv as unknown as Storage;
