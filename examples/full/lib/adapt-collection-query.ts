import type { ExtendedRecordMap } from 'notion-types'

/**
 * Adapts collection_query data from a v3 response to a v5 response
 * Use this when you have existing v3 data and want to enrich v5 responses
 */
export function adaptCollectionQuery(
  v5RecordMap: ExtendedRecordMap,
  v3RecordMap: any // Use any to handle v3 response structure differences
): ExtendedRecordMap {
  // Copy collection_query from v3 to v5
  if (
    v3RecordMap.collection_query &&
    Object.keys(v3RecordMap.collection_query).length > 0
  ) {
    v5RecordMap.collection_query = { ...v3RecordMap.collection_query }
    console.log(
      `✅ Adapted ${Object.keys(v3RecordMap.collection_query).length} collection queries from v3`
    )
  }

  // Also copy any missing collection pages that exist in v3 but not in v5
  if (v3RecordMap.block) {
    for (const [blockId, block] of Object.entries(v3RecordMap.block)) {
      if (!v5RecordMap.block[blockId]) {
        v5RecordMap.block[blockId] = block as any
      }
    }
  }

  return v5RecordMap
}
