import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from '@notionhq/client'
import type * as notion from 'notion-types'
import { parsePageId } from 'notion-utils'
import PQueue from 'p-queue'

import type * as types from './types'
import { convertCollection } from './convert-collection'
import { createDefaultCollectionView } from './convert-collection-view'
import { convertPage } from './convert-page'

export class NotionCompatAPI {
  client: Client
  private apiVersion: string

  constructor(client: Client, options?: { apiVersion?: string }) {
    this.client = client
    this.apiVersion = options?.apiVersion || '2025-09-03'
  }

  public async getPage(
    rawPageId: string,
    options?: {
      /**
       * Set default full-width layout for pages
       * @default true for database pages, false for regular pages
       */
      fullWidth?: boolean
      /**
       * Set page font style
       * @default 'default'
       */
      pageFont?: 'default' | 'serif' | 'mono'
      /**
       * Set small text mode
       * @default false
       */
      smallText?: boolean
      /**
       * Automatically fetch database entries and include in collection_query
       * @default true
       */
      fetchDatabaseEntries?: boolean
      /**
       * Maximum entries to fetch per database
       * @default 100
       */
      maxDatabaseEntries?: number
      /**
       * Concurrency for fetching nested blocks
       * @default 4
       */
      concurrency?: number
    }
  ): Promise<notion.ExtendedRecordMap> {
    const pageId = parsePageId(rawPageId)
    if (!pageId) {
      throw new Error(`Invalid page id "${rawPageId}"`)
    }

    const [page, block, children] = await Promise.all([
      this.client.pages.retrieve({ page_id: pageId }),
      this.client.blocks.retrieve({ block_id: pageId }),
      this.getAllBlockChildren(pageId)
    ])

    const { blockMap, blockChildrenMap, pageMap, databaseMap, parentMap } =
      await this.resolvePage(pageId, {
        concurrency: options?.concurrency
      })

    // Extract database IDs from child_database blocks and fetch them
    const databaseIds = this.extractDatabaseIds(blockMap)

    // Log to file for debugging
    const logPath = join(process.cwd(), 'notion-compat-debug.log')
    const logEntries: string[] = []

    logEntries.push(`\n=== DATABASE DETECTION LOG ===`)
    logEntries.push(`Timestamp: ${new Date().toISOString()}`)
    logEntries.push(`Page ID: ${pageId}`)
    logEntries.push(`Total blocks in blockMap: ${Object.keys(blockMap).length}`)
    logEntries.push(
      `Found ${databaseIds.length} child_database blocks: ${JSON.stringify(databaseIds)}`
    )

    console.log(
      `Found ${databaseIds.length} databases from child_database blocks:`,
      databaseIds
    )

    for (const dbId of databaseIds) {
      logEntries.push(`\nProcessing database: ${dbId}`)

      if (!databaseMap[dbId]) {
        logEntries.push(`  - Not in databaseMap, fetching...`)
        const dataSource = await this.getDataSource(dbId)

        if (dataSource) {
          databaseMap[dbId] = dataSource
          logEntries.push(`  - Successfully added to databaseMap`)
          logEntries.push(
            `  - Data source object: ${JSON.stringify(dataSource, null, 2)}`
          )
          console.log(`Added database ${dbId} to databaseMap`)
        } else {
          logEntries.push(`  - Failed to fetch data source`)
        }
      } else {
        logEntries.push(`  - Already in databaseMap`)
      }
    }

    logEntries.push(
      `\nFinal databaseMap keys: ${JSON.stringify(Object.keys(databaseMap))}`
    )
    logEntries.push(`=== END DATABASE DETECTION LOG ===\n`)

    // Write log to file
    try {
      writeFileSync(logPath, logEntries.join('\n'), { flag: 'a' })
      console.log(` Debug log written to: ${logPath}`)
    } catch (err: any) {
      console.warn('Failed to write debug log:', err.message)
    }

    const recordMap = await convertPage({
      pageId,
      blockMap,
      blockChildrenMap,
      pageMap,
      databaseMap,
      parentMap,
      fullWidth: options?.fullWidth,
      pageFont: options?.pageFont,
      smallText: options?.smallText,
      fetchDatabaseEntries: options?.fetchDatabaseEntries ?? true,
      maxDatabaseEntries: options?.maxDatabaseEntries,
      notionClient: this.client
    })

    ;(recordMap as any).raw = {
      page,
      block,
      children
    }

    // Debug: Print recordMap structure for comparison
    const recordMapJson = JSON.stringify(recordMap, null, 2)
    console.log('\n=== RECORD MAP STRUCTURE ===')
    console.log('Block count:', Object.keys(recordMap.block).length)
    console.log('Collection count:', Object.keys(recordMap.collection).length)
    console.log(
      'Collection view count:',
      Object.keys(recordMap.collection_view).length
    )
    console.log(
      'Collection query keys:',
      Object.keys(recordMap.collection_query)
    )
    console.log('\nFull recordMap JSON:')
    console.log(recordMapJson)
    console.log('=== END RECORD MAP ===\n')

    // Write to file for easy comparison
    try {
      const outputPath = join(process.cwd(), 'record-map-output.json')
      writeFileSync(outputPath, recordMapJson, 'utf8')
      console.log(`✅ RecordMap written to: ${outputPath}`)
    } catch (err: any) {
      console.warn('Failed to write recordMap to file:', err.message)
    }

    return recordMap
  }

  /**
   * Extract database IDs from collection_view blocks in the blockMap
   */
  private extractDatabaseIds(blockMap: any): string[] {
    const databaseIds: string[] = []

    for (const [blockId, blockData] of Object.entries(blockMap)) {
      const block = blockData as any
      if (block.type === 'child_database') {
        // child_database blocks have the database ID as their block ID
        databaseIds.push(blockId)
      }
    }

    return databaseIds
  }

  /**
   * Find inline databases that are children of the given page
   * Uses API version 2025-09-03 is_inline property
   */
  private async findInlineDatabases(pageId: string): Promise<any[]> {
    try {
      // In 2025-09-03, search for 'data_source' instead of 'database'
      const searchResults = await (this.client.search as any)({
        filter: {
          value: 'data_source',
          property: 'object'
        },
        page_size: 100
      })

      // Filter for inline data sources that belong to this page
      const inlineDbs = searchResults.results.filter((result: any) => {
        return (
          result.object === 'data_source' &&
          result.database_parent?.type === 'page_id' &&
          result.database_parent?.page_id === pageId
        )
      })

      console.log(
        `Found ${inlineDbs.length} inline databases for page ${pageId}`
      )
      return inlineDbs
    } catch (err: any) {
      console.warn('Failed to search for inline databases:', err.message)
      return []
    }
  }

  /**
   * Get data source for a database (API version 2025-09-03)
   * Databases now have child data_sources with the schema
   */
  private async getDataSource(databaseId: string): Promise<any> {
    try {
      const database = await this.client.databases.retrieve({
        database_id: databaseId
      })

      // In 2025-09-03, databases have data_sources array
      if (
        (database as any).data_sources &&
        (database as any).data_sources.length > 0
      ) {
        const dataSourceId = (database as any).data_sources[0].id

        // Fetch the data source schema using the new endpoint
        const dataSource = await (this.client as any).request({
          method: 'get',
          path: `data_sources/${dataSourceId}`
        })

        return dataSource
      }

      // Fallback: return database as-is for older API versions
      return database
    } catch (err: any) {
      console.warn(
        `Failed to get data source for database ${databaseId}:`,
        err.message
      )
      return null
    }
  }

  public async getDatabase(databaseId: string): Promise<{
    collection: notion.Collection
    collectionView: notion.CollectionView
  }> {
    // Use data source endpoint for 2025-09-03
    const dataSource = await this.getDataSource(databaseId)

    if (!dataSource) {
      throw new Error(`Failed to retrieve database ${databaseId}`)
    }

    const typedDatabase = dataSource as types.Database
    const collection = convertCollection(typedDatabase)
    const collectionView = createDefaultCollectionView(databaseId, 'table')

    return {
      collection,
      collectionView
    }
  }

  public async queryDatabase(
    databaseId: string,
    options?: {
      filter?: any
      sorts?: any[]
      pageSize?: number
    }
  ): Promise<types.DatabaseQueryResponse> {
    // In v5, use the request method for database queries
    return (this.client as any).request({
      method: 'post',
      path: `databases/${databaseId}/query`,
      body: {
        filter: options?.filter,
        sorts: options?.sorts,
        page_size: options?.pageSize || 100
      }
    })
  }

  async resolvePage(
    rootBlockId: string,
    {
      concurrency = 4
    }: {
      concurrency?: number
    } = {}
  ) {
    const blockMap: types.BlockMap = {}
    const pageMap: types.PageMap = {}
    const databaseMap: types.DatabaseMap = {}
    const parentMap: types.ParentMap = {}
    const blockChildrenMap: types.BlockChildrenMap = {}
    const pendingBlockIds = new Set<string>()
    const queue = new PQueue({ concurrency })

    const processBlock = async (
      blockId: string,
      { shallow = false }: { shallow?: boolean } = {}
    ) => {
      if (!blockId || pendingBlockIds.has(blockId)) {
        return
      }

      pendingBlockIds.add(blockId)
      void queue.add(async () => {
        try {
          let partialBlock = blockMap[blockId]
          if (!partialBlock) {
            partialBlock = await this.client.blocks.retrieve({
              block_id: blockId
            })
            blockMap[blockId] = partialBlock
          }

          const block = partialBlock as types.Block

          if (block.type === 'child_page') {
            if (!pageMap[blockId]) {
              const partialPage = await this.client.pages.retrieve({
                page_id: blockId
              })

              pageMap[blockId] = partialPage

              const page = partialPage as types.Page
              switch (page.parent?.type) {
                case 'page_id':
                  void processBlock(page.parent.page_id, {
                    shallow: true
                  })
                  if (!parentMap[blockId]) {
                    parentMap[blockId] = page.parent.page_id
                  }
                  break

                case 'database_id':
                  void processBlock(page.parent.database_id, {
                    shallow: true
                  })
                  if (!parentMap[blockId]) {
                    parentMap[blockId] = page.parent.database_id
                  }
                  break
              }
            }

            if (blockId !== rootBlockId) {
              // don't fetch children or recurse on subpages
              return
            }
          }

          if (block.type === 'child_database') {
            if (!databaseMap[blockId]) {
              try {
                const database = await this.client.databases.retrieve({
                  database_id: blockId
                })
                databaseMap[blockId] = database
              } catch (err: any) {
                console.warn('failed resolving database', blockId, err.message)
              }
            }
            // Don't fetch children of databases - they're queried separately
            return
          }

          if (shallow) {
            return
          }

          const children = await this.getAllBlockChildren(blockId)
          blockChildrenMap[blockId] = children.map((child) => child.id)

          for (const child of children) {
            const childBlock = child as types.Block
            const mappedChildBlock = blockMap[child.id] as types.Block
            if (
              !mappedChildBlock ||
              (!mappedChildBlock.type && childBlock.type)
            ) {
              blockMap[child.id] = childBlock
              parentMap[child.id] = blockId

              const details: any =
                childBlock[childBlock.type as keyof types.Block]
              if (details?.rich_text) {
                const richTextMentions = details.rich_text.filter(
                  (richTextItem: types.RichTextItem) =>
                    richTextItem.type === 'mention'
                )

                for (const richTextMention of richTextMentions) {
                  switch (richTextMention.mention?.type) {
                    case 'page': {
                      const pageId = richTextMention.mention.page.id
                      void processBlock(pageId, { shallow: true })
                      break
                    }

                    case 'database': {
                      const databaseId = richTextMention.mention.database.id
                      void processBlock(databaseId, { shallow: true })
                      break
                    }
                  }
                }
              }

              if (childBlock.type === 'link_to_page') {
                switch (childBlock.link_to_page?.type) {
                  case 'page_id':
                    void processBlock(childBlock.link_to_page.page_id, {
                      shallow: true
                    })
                    break

                  case 'database_id':
                    void processBlock(childBlock.link_to_page.database_id, {
                      shallow: true
                    })
                    break
                }
              }

              if (
                childBlock.has_children &&
                childBlock.type !== 'child_database'
              ) {
                void processBlock(childBlock.id)
              }
            }
          }
        } catch (err: any) {
          console.warn('failed resolving block', blockId, err.message)
        } finally {
          pendingBlockIds.delete(blockId)
        }
      })
    }

    await processBlock(rootBlockId)
    await queue.onIdle()

    return {
      blockMap,
      blockChildrenMap,
      pageMap,
      databaseMap,
      parentMap
    }
  }

  async getAllBlockChildren(blockId: string) {
    let blocks: types.BlockChildren = []
    let cursor: string | undefined

    do {
      const res = await this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor
      })

      blocks = blocks.concat(res.results)
      if (!res.next_cursor) break

      cursor = res.next_cursor
    } while (cursor)

    return blocks
  }
}
