# Notion API Version 2025-09-03 Upgrade Summary

## Changes Made

### 1. Package Updates

- **@notionhq/client**: Updated from `^2.3.0` to `^5.0.0`
- **API Version**: Now using `2025-09-03` with new data source model

### 2. New Features

#### Inline Database Detection

Added `findInlineDatabases()` method that:

- Uses the Search API to find databases
- Filters by `is_inline: true` property (new in 2025-09-03)
- Filters by parent page ID to get only inline databases for the current page

#### Data Source Fetching

Added `getDataSource()` method that:

- Retrieves database with its `data_sources` array
- Fetches the first data source schema using `/v1/data_sources/:id` endpoint
- Falls back to database object for older API versions

#### Automatic Database Population

Updated `resolvePage()` to:

- Accept `inlineDatabases` parameter
- Automatically fetch data sources for each inline database
- Populate `databaseMap` with database schemas
- This ensures `collection` and `collection_view` maps are populated

### 3. Code Changes

**`/packages/notion-compat/src/notion-compat-api.ts`:**

- Added `apiVersion` property to track API version
- Added `findInlineDatabases()` private method
- Added `getDataSource()` private method
- Updated `getPage()` to discover and fetch inline databases
- Updated `resolvePage()` signature to accept `inlineDatabases`
- Updated `getDatabase()` to use data source endpoint

**`/pnpm-workspace.yaml`:**

- Updated catalog entry for `@notionhq/client` to `^5.0.0`

**`/packages/notion-compat/package.json`:**

- Updated `peerDependencies` to require `@notionhq/client` `^5.0.0`

### 4. How It Works

```
1. User calls getPage(pageId)
   ↓
2. findInlineDatabases(pageId) searches for inline databases
   ↓
3. For each inline database found:
   - getDataSource(databaseId) fetches the data source schema
   - Database added to databaseMap
   ↓
4. convertPage() processes databaseMap
   ↓
5. Databases converted to collection and collection_view maps
   ↓
6. Result: Fully populated ExtendedRecordMap with databases
```

### 5. Benefits

✅ **Inline databases now detected automatically** - No manual database ID specification needed
✅ **Uses official API** - Leverages new 2025-09-03 features
✅ **Backward compatible output** - Still produces unofficial API format for react-notion-x
✅ **Proper schema access** - Data sources provide complete property schemas

### 6. Breaking Changes

⚠️ **Client Initialization**: If you're creating the client manually, ensure it uses API version 2025-09-03:

```typescript
const client = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03'
})
```

⚠️ **Peer Dependency**: Projects must now use `@notionhq/client` v5.0.0 or higher

### 7. Testing

To test the changes:

1. Run `pnpm install` to update dependencies
2. Run `pnpm dev` to rebuild the package
3. Call `getPage()` with a page that has inline databases
4. Check console output for:
   - "Found X inline databases for page..."
   - "Added inline database ... to databaseMap"
5. Verify `collection` and `collection_view` maps are populated in output

### 8. Next Steps

After rebuilding:

1. Test with your page containing inline databases
2. Verify the `record-map-output.json` now has populated `collection` and `collection_view` maps
3. Confirm the page renders correctly with databases visible

## References

- [Notion API Version Changes](https://developers.notion.com/reference/changes-by-version)
- [2025-09-03 Upgrade Guide](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
- [Database Object Reference](https://developers.notion.com/reference/database)
- [Data Source Object Reference](https://developers.notion.com/reference/data-source)
