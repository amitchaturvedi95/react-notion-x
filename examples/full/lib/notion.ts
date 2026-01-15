import { Client } from '@notionhq/client'
import { NotionAPI } from 'notion-client'
import { NotionCompatAPI } from 'notion-compat'
import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'

import { getUseOfficialNotionAPI, previewImagesEnabled } from './config'
import { getPreviewImageMap } from './preview-images'

export function createNotionAPI(searchParams?: { official?: string }) {
  console.log('searchParams', searchParams)
  const useOfficialNotionAPI = getUseOfficialNotionAPI(searchParams)
  console.log('useOfficial API', useOfficialNotionAPI, {
    activeUser: process.env.NOTION_ACTIVE_USER,
    authToken: process.env.NOTION_AUTH_TOKEN
  })

  const notion = useOfficialNotionAPI
    ? new NotionCompatAPI(new Client({ auth: process.env.NOTION_TOKEN }))
    : new NotionAPI({
        activeUser: process.env.NOTION_ACTIVE_USER,
        authToken: process.env.NOTION_AUTH_TOKEN
      })

  if (useOfficialNotionAPI) {
    console.warn(
      'Using the official Notion API. Note that many blocks only include partial support for formatting and layout. Use at your own risk.'
    )
  }

  return notion
}

const notion = createNotionAPI()

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  const recordMap = await notion.getPage(pageId, { fetchRelationPages: true })
  console.log(JSON.stringify(recordMap))

  if (previewImagesEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  return recordMap
}

export async function search(params: SearchParams): Promise<SearchResults> {
  if ('search' in notion) {
    return notion.search(params)
  } else {
    throw new Error('Notion API does not support search')
  }
}
