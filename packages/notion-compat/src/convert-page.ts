import type * as notion from 'notion-types'

import type * as types from './types'
import { convertBlock } from './convert-block'

export function convertPage({
  pageId,
  blockMap,
  blockChildrenMap,
  pageMap,
  parentMap
}: {
  pageId: string
  blockMap: types.BlockMap
  blockChildrenMap: types.BlockChildrenMap
  pageMap: types.PageMap
  parentMap: types.ParentMap
}): notion.ExtendedRecordMap {
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
    parentMap
  })

  const compatPageBlocks = Object.keys(pageMap)
    .filter((id) => id !== pageId)
    .map((id) =>
      convertPageBlock({
        pageId: id,
        blockMap,
        blockChildrenMap,
        pageMap,
        parentMap
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

  // Add space information if available from any block
  const spaceId = extractSpaceId(compatBlockMap)
  const teamInfo = spaceId ? createTeamInfo(spaceId) : {}

  return {
    block: compatBlockMap as any,
    collection: {},
    collection_view: {},
    collection_query: {},
    signed_urls: {},
    notion_user: {},
    ...(spaceId && { space: teamInfo })
  }
}

function extractSpaceId(
  blockMap: Record<string, { type: string; value: any }>
): string | null {
  // Try to extract space_id from any block that has it
  for (const block of Object.values(blockMap)) {
    if (block.value.space_id) {
      return block.value.space_id
    }
  }
  return null
}

function createTeamInfo(spaceId: string): Record<string, any> {
  return {
    [spaceId]: {
      value: {
        id: spaceId,
        name: 'Notion Workspace',
        space_id: spaceId,
        created_time: Date.now() * 1000,
        last_edited_time: Date.now() * 1000,
        permissions: [
          {
            role: 'editor',
            type: 'space_permission'
          }
        ]
      }
    }
  }
}

export function convertPageBlock({
  pageId,
  blockMap,
  blockChildrenMap,
  pageMap,
  parentMap
}: {
  pageId: string
  blockMap: types.BlockMap
  blockChildrenMap: types.BlockChildrenMap
  pageMap: types.PageMap
  parentMap: types.ParentMap
}): notion.Block | null {
  const partialPage = pageMap[pageId]
  const page = partialPage as types.Page

  if (page) {
    const compatPageBlock = convertBlock({
      block: { ...page, type: 'child_page' } as unknown as types.Block,
      children: blockChildrenMap[page.id],
      pageMap,
      blockMap,
      parentMap
    })

    return compatPageBlock
  }

  return null
}
