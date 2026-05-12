# Document Inputs

## Supported inputs

- Plaintext files (`.txt`, `.md`, source files)
- Rich formats via Unstructured path (`.pdf`, `.docx`, `.pptx`, images, HTML)

## Requirements

- `JEANCLAUDE_DOCUMENTS=on`
- `UNSTRUCTURED_API_KEY` for rich-format partitioning

## Storage

- Default store: `JEANCLAUDE_DOCUMENT_STORE=/workspace/.jeanclaude/documents`
- Stored artifacts include chunk text and metadata for retrieval.

## Chunk metadata

Each chunk tracks:

- document id
- chunk id/index
- source path
- collection
- score (query-time)

## Guardrails

Blocked by default:

- `.env`, `.env.*`
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519`
- paths under `.git/`, `secrets/`, `node_modules/`
- paths outside `/workspace`
- oversized files (configurable max)

## Privacy warning

Ingested content is copied into local document store for retrieval. Review document scope before ingesting sensitive data.

## Cleanup

Delete store directory to purge indexed chunks:

```bash
rm -rf ./.jeanclaude/documents
```
