# API Version 2025-09-03 Implementation

## Overview

Updated `notion-compat` to use Notion API version 2025-09-03, which introduces:

- **Data Sources**: Databases now have child data sources
- **Inline Database Detection**: `is_inline` property identifies inline databases
- **New Endpoints**: `/v1/data_sources/:data_source_id` for schema access

## Key Changes

### 1. Database Model

**Before (2022-06-28):**

- Database = Data Source (combined concept)
- `database.properties` contained schema

**After (2025-09-03):**

- Database → Data Sources → Pages (separated)
- `database.data_sources[]` contains array of data sources
- Each data source has `id`, `name`, and `properties` (schema)

### 2. Inline Database Support

The new `is_inline` boolean property on databases tells us if a database is:

- `true`: Inline database (embedded in a page)
- `false`: Standalone database (full-page)

This solves our issue where inline databases weren't being detected!

### 3. API Version Header

The client must send `Notion-Version: 2025-09-03` header to use the new API.

## Implementation Strategy

### Phase 1: Detect Inline Databases

1. When fetching a page, search for inline databases using the Search API
2. Filter results by `is_inline: true` and parent page
3. Add these databases to `databaseMap`

### Phase 2: Fetch Data Sources

1. For each database, retrieve its data sources
2. Use the first data source (most databases have one)
3. Fetch the data source schema using `/v1/data_sources/:data_source_id`

### Phase 3: Convert to Collections

1. Convert data sources to `collection` objects
2. Create default `collection_view` objects
3. Populate `collection_query` with database entries

## Code Changes Required

### 1. Update Client Initialization

```typescript
const client = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03'
})
```

### 2. Add Inline Database Discovery

```typescript
async function findInlineDatabases(pageId: string): Promise<Database[]> {
  const searchResults = await client.search({
    filter: {
      value: 'database',
      property: 'object'
    }
    // Filter by parent in post-processing
  })

  return searchResults.results.filter(
    (db) => db.is_inline && db.parent.page_id === pageId
  )
}
```

### 3. Fetch Data Sources

```typescript
async function getDataSource(databaseId: string) {
  const database = await client.databases.retrieve({ database_id: databaseId })
  const dataSourceId = database.data_sources[0].id

  // Use new data source endpoint
  const dataSource = await client.request({
    method: 'get',
    path: `data_sources/${dataSourceId}`
  })

  return dataSource
}
```

## Migration Notes

### Breaking Changes

- `@notionhq/client` updated from v2.3.0 to v5.0.0
- Database objects no longer have `properties` at top level
- Must use data source endpoints for schema access

### Backward Compatibility

The implementation maintains backward compatibility with the unofficial API format:

- Still outputs `collection` and `collection_view` maps
- Still uses `collection_id` in blocks
- No changes to consumer code required

## Testing

After implementation, verify:

1. ✅ Inline databases are detected and fetched
2. ✅ `collection` map is populated with database schemas
3. ✅ `collection_view` map contains default views
4. ✅ `collection_query` includes database entries
5. ✅ Page renders correctly with databases visible

## References

- [API Version Changes](https://developers.notion.com/reference/changes-by-version)
- [Upgrade Guide](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
- [Database Object](https://developers.notion.com/reference/database)
- [Data Source Object](https://developers.notion.com/reference/data-source)
