import fs from 'node:fs';

export async function partitionDocument(config, inputPath) {
  if (!config.unstructuredApiKey) {
    throw new Error('UNSTRUCTURED_API_KEY is required for document partitioning');
  }

  const buffer = fs.readFileSync(inputPath);
  const form = new FormData();
  form.append('files', new Blob([buffer]), inputPath.split('/').pop() || 'document.bin');
  form.append('strategy', 'auto');

  const res = await fetch(config.unstructuredApiUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'unstructured-api-key': config.unstructuredApiKey
    },
    body: form
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Unstructured request failed: HTTP ${res.status} ${body}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error('Unstructured response was not an array');
  }

  return json;
}
