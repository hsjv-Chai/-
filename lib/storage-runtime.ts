import {nodeStorage} from './node-storage.mjs';
import type {Storage} from './storage-contract';
export const env=nodeStorage as unknown as Storage;
