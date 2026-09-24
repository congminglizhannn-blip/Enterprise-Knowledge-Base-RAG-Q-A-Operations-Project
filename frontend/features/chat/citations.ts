import type { Citation } from "./types";

export type DocumentCitation = {
  key: string;
  source: Citation;
  chunks: Citation[];
};

// Preserve retrieval order and merge by identity, never by name when an ID exists.
export function groupCitationsByDocument(citations: Citation[]): DocumentCitation[] {
  const groups = new Map<string, DocumentCitation>();
  const seenChunks = new Map<string, Set<string>>();
  for (const citation of citations) {
    const key = citation.document_id ? `id:${citation.document_id}` : `legacy:${citation.document_name}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, source: citation, chunks: [] };
      groups.set(key, group);
      seenChunks.set(key, new Set());
    }
    const chunkKey = citation.chunk_id ? `id:${citation.chunk_id}` : `preview:${citation.content_preview}`;
    const seen = seenChunks.get(key)!;
    if (!seen.has(chunkKey)) {
      group.chunks.push(citation);
      seen.add(chunkKey);
    }
  }
  return Array.from(groups.values());
}
