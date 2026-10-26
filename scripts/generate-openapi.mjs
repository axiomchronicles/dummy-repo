import { writeFile } from 'node:fs/promises';
import { openApiDocument } from '../apps/api/src/openapi.ts';
await writeFile(
  'docs/api/openapi.json',
  JSON.stringify(openApiDocument(), null, 2) + '\n',
);
console.log('OpenAPI generated from the shared Zod operation catalog');
