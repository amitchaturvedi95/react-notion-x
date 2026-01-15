import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from '@notionhq/client'
import type * as notion from 'notion-types'

import type * as types from './types'
import { convertBlock } from './convert-block'
import { convertCollection } from './convert-collection'
import { createDefaultCollectionView } from './convert-collection-view'

export async function convertPage({
  pageId,
  blockMap,
  blockChildrenMap,
  pageMap,
  databaseMap,
  parentMap,
  fullWidth,
  pageFont,
  smallText,
  fetchDatabaseEntries = true,
  maxDatabaseEntries = 100,
  notionClient
}: {
  pageId: string
  blockMap: types.BlockMap
  blockChildrenMap: types.BlockChildrenMap
  pageMap: types.PageMap
  databaseMap: types.DatabaseMap
  parentMap: types.ParentMap
  fullWidth?: boolean
  pageFont?: 'default' | 'serif' | 'mono'
  smallText?: boolean
  fetchDatabaseEntries?: boolean
  maxDatabaseEntries?: number
  notionClient?: Client
}): Promise<notion.ExtendedRecordMap> {
  const compatBlocks = Object.values(blockMap).map((block) =>
    convertBlock({
      block,
      children: blockChildrenMap[block.id],
      pageMap,
      blockMap,
      parentMap
    })
  )

  const compatPageBlock = convertPageBlock({
    pageId,
    blockMap,
    blockChildrenMap,
    pageMap,
    databaseMap,
    parentMap,
    fullWidth,
    pageFont,
    smallText
  })

  const compatPageBlocks = Object.keys(pageMap)
    .filter((id) => id !== pageId)
    .map((id) =>
      convertPageBlock({
        pageId: id,
        blockMap,
        blockChildrenMap,
        pageMap,
        databaseMap,
        parentMap,
        fullWidth,
        pageFont,
        smallText
      })
    )

  const compatBlockMap = Object.fromEntries(
    [compatPageBlock, ...compatBlocks, ...compatPageBlocks]
      .filter(Boolean)
      .map((block) => [
        block!.id,
        {
          type: 'reader',
          value: block!
        }
      ])
  )

  // Convert databases to collections
  const collectionMap: notion.CollectionMap = {}
  const collectionViewMap: notion.CollectionViewMap = {}
  const collectionQuery: any = {}

  const logEntries: string[] = []
  const log = (msg: string) => {
    console.log(msg)
    logEntries.push(msg)
  }

  log(
    `=== CONVERT PAGE: Processing ${Object.keys(databaseMap).length} databases ===`
  )
  log(`fetchDatabaseEntries: ${fetchDatabaseEntries}`)
  log(`notionClient exists: ${!!notionClient}`)

  for (const [databaseId, database] of Object.entries(databaseMap)) {
    log(`Processing database: ${databaseId}`)
    const typedDatabase = database as types.Database
    const collection = convertCollection(typedDatabase)
    const collectionView = createDefaultCollectionView(databaseId, 'table')

    // The actual collection ID is the data source ID, not the database block ID
    const collectionId = collection.id

    // Use collectionId (data source ID) as the key, not databaseId (database block ID)
    // This matches V3 format where collections are keyed by data source ID
    collectionMap[collectionId] = {
      role: 'reader',
      value: collection
    }

    collectionViewMap[collectionView.id] = {
      role: 'reader',
      value: collectionView
    }

    // Fetch database entries if requested
    log(
      `Checking if should fetch entries: fetchDatabaseEntries=${fetchDatabaseEntries}, notionClient=${!!notionClient}`
    )
    if (fetchDatabaseEntries && notionClient) {
      log(
        `Fetching entries for database ${databaseId} (collection ${collectionId})...`
      )
      try {
        // In v5, use the data_sources endpoint with the collection ID (data source ID)
        const queryResult = await (notionClient as any).request({
          method: 'post',
          path: `data_sources/${collectionId}/query`,
          body: {
            page_size: maxDatabaseEntries
          }
        })

        log(
          `Query result for ${databaseId}: ${queryResult.results.length} pages`
        )

        // Build collection query result
        const blockIds = queryResult.results.map((page: any) => page.id)
        log(`Block IDs: ${blockIds.join(', ')}`)

        // Use the actual collection ID (data source ID) as the key, not the database block ID
        collectionQuery[collectionId] = {
          [collectionView.id]: {
            type: collectionView.type,
            total: queryResult.results.length,
            blockIds,
            aggregationResults: [],
            collection_group_results: {
              type: 'results',
              blockIds,
              hasMore: !!queryResult.has_more
            }
          }
        }

        // Add database pages to pageMap so they're included in the recordMap
        for (const result of queryResult.results) {
          if (!pageMap[result.id]) {
            pageMap[result.id] = result as any
          }
        }
      } catch (err: any) {
        const errMsg = `Failed to query database ${databaseId}: ${err.message}`
        console.warn(errMsg)
        logEntries.push(errMsg)
      }
    }
  }

  // Write logs to file
  if (logEntries.length > 0) {
    try {
      const logPath = join(process.cwd(), 'notion-compat-debug.log')
      const timestamp = new Date().toISOString()
      const logContent = `\n=== CONVERT PAGE ${timestamp} ===\n${logEntries.join('\n')}\n`
      writeFileSync(logPath, logContent, { flag: 'a' })
    } catch {
      // Ignore file write errors
    }
  }

  return {
    block: compatBlockMap as any,
    collection: collectionMap,
    collection_view: collectionViewMap,
    collection_query: collectionQuery,
    signed_urls: {},
    notion_user: {}
  }
}

export function convertPageBlock({
  pageId,
  blockMap,
  blockChildrenMap,
  pageMap,
  databaseMap: _databaseMap,
  parentMap,
  fullWidth,
  pageFont,
  smallText
}: {
  pageId: string
  blockMap: types.BlockMap
  blockChildrenMap: types.BlockChildrenMap
  pageMap: types.PageMap
  databaseMap: types.DatabaseMap
  parentMap: types.ParentMap
  fullWidth?: boolean
  pageFont?: 'default' | 'serif' | 'mono'
  smallText?: boolean
}): notion.Block | null {
  const pageBlock = blockMap[pageId]
  if (pageBlock && (pageBlock as any).object === 'page') {
    const page = pageBlock as unknown as types.Page
    const compatBlock = convertBlock({
      block: { ...page, type: 'child_page' } as unknown as types.Block,
      children: blockChildrenMap[page.id],
      pageMap,
      blockMap,
      parentMap
    })

    if (compatBlock) {
      const fileIds: string[] = []

      // Set page icon
      if (page.icon) {
        switch (page.icon.type) {
          case 'emoji':
            compatBlock.format.page_icon = page.icon.emoji
            break

          case 'external':
            compatBlock.format.page_icon = page.icon.external.url
            break

          case 'file': {
            const iconUrl = page.icon.file.url
            if (iconUrl) {
              compatBlock.format.page_icon = iconUrl
              // Extract file ID if present
              const fileIdMatch = iconUrl.match(
                /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
              )
              if (fileIdMatch && fileIdMatch[1]) {
                fileIds.push(fileIdMatch[1])
              }
            }
            break
          }
        }
      }

      // Set page cover
      if (page.cover) {
        switch (page.cover.type) {
          case 'external':
            if (page.cover.external.url) {
              compatBlock.format.page_cover = page.cover.external.url
            }
            break

          case 'file': {
            const coverUrl = page.cover.file.url
            if (!coverUrl) break
            // Extract file ID and filename from URL for attachment: format
            const urlMatch = coverUrl.match(
              /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/([^?]+)/
            )
            if (urlMatch && urlMatch[1] && urlMatch[2]) {
              const fileId = urlMatch[1]
              const filename = urlMatch[2]
              // Use attachment: format like v3
              compatBlock.format.page_cover = `attachment:${fileId}:${filename}`
              fileIds.push(fileId)
            } else {
              // Fallback to URL if we can't parse it
              compatBlock.format.page_cover = coverUrl
            }
            break
          }
        }

        // Set cover position if available
        compatBlock.format.page_cover_position = 0.5 // Default center position
      }

      // Add file_ids array if we have any files
      if (fileIds.length > 0) {
        ;(compatBlock as any).file_ids = fileIds
      }

      // Apply fullWidth option
      if (fullWidth !== undefined) {
        compatBlock.format.page_full_width = fullWidth
      } else {
        // Smart default: enable full-width for pages with covers or database pages
        const hasFullWidthIndicator = !!(
          page.cover || page.parent?.type === 'database_id'
        )
        compatBlock.format.page_full_width = hasFullWidthIndicator
      }

      // Apply pageFont option
      if (pageFont && pageFont !== 'default') {
        compatBlock.format.page_font = pageFont
      }

      // Apply smallText option
      if (smallText !== undefined) {
        compatBlock.format.page_small_text = smallText
      }
    }

    return compatBlock
  }

  return null
}
