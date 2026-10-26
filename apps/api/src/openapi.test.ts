import { describe, it, expect } from 'vitest';
import { openApiDocument, routes } from './openapi';
describe('published OpenAPI wire contracts', () => {
  it('generates every operation with strict launch command, no Swagger inference', () => {
    const document = openApiDocument() as {
      openapi: string;
      paths: Record<
        string,
        Record<
          string,
          {
            requestBody?: {
              content: Record<
                string,
                {
                  schema: {
                    additionalProperties?: boolean;
                    properties?: Record<string, unknown>;
                  };
                }
              >;
            };
          }
        >
      >;
    };
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths).length).toBeGreaterThan(30);
    for (const route of routes)
      expect(document.paths[route.path]?.[route.method]).toBeDefined();
    const schema =
      document.paths['/campaigns/{id}/launch'].post.requestBody!.content[
        'application/json'
      ].schema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty('confirmed');
  });
});

import { clean } from './common';
describe('private read model serialization', () => {
  it('camel-cases relational fields while preserving imported column names and extracted answers', () => {
    expect(
      clean({
        source_row: 3,
        source_cells: { first_name: 'Casey' },
        extracted_fields: { preferred_time: null },
        provider_attempt_id: 'private-provider-id',
        provider_config: { appId: 'private-committed-app' },
        interaction_id: 'private-interaction',
        created_at: new Date('2026-10-24T00:00:00Z'),
      }),
    ).toEqual({
      sourceRow: 3,
      sourceCells: { first_name: 'Casey' },
      extractedFields: { preferred_time: null },
      createdAt: '2026-10-24T00:00:00.000Z',
    });
  });
});
