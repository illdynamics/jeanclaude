import { DocumentStore } from './document-store.js';

export function documentQuery(config, query, collection = undefined, maxResults = 5) {
  const store = new DocumentStore(config);
  return store.query({ query, collection, maxResults });
}
