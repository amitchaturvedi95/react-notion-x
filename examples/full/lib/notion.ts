import { Client } from '@notionhq/client'
import { NotionAPI } from 'notion-client'
import { NotionCompatAPI } from 'notion-compat'
import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'

import { previewImagesEnabled, useOfficialNotionAPI } from './config'
import { getPreviewImageMap } from './preview-images'

const notion = useOfficialNotionAPI
  ? new NotionCompatAPI(new Client({ auth: process.env.NOTION_TOKEN }))
  : new NotionAPI({
      activeUser: '2e7d872b-594c-8106-81da-0002b8694b92',
      authToken:
        'v03:eyJhbGciOiJkaXIiLCJraWQiOiJwcm9kdWN0aW9uOnRva2VuLXYzOjIwMjQtMTEtMDciLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..pgpn2gq2d4nC-3lVveVwUA.0quYXiKI0ciP2C1ELBNrF5GRphoTH0UJ1ZzpRkzKWaUSsRlfPyqhSevoYB1moZXa9rDMb-DhwEyUmciS11xN11avXCcfae1dNNdL7IEPM0OCVyRuvXhXKuahk8fi-YdxnR9t87T3lUAG1PBDuhaOeg0skp4y0NVz1rzLN5Mon6XI71oneztqRFPp_cmvHcOTA9crKylh3ZI02Nbtk8CZisuhoNfZWu7qlZSquSozhmeKZESIH8ld2Af1FfLIHK5XCN5EUx-S4HyVOSPQ1Y969HG2AzS64jWZcDItlAIlxzUpPcbUlb-AleKAFhbCq2ty6zsZrg_ogT519WhmHIR5W7A6YA2rwo_W_MEhwajvoSYqWD1ao6q1Ob04em1DLt2Z.RE9hsmtU5IISY5H-7xl4OlzeWUm_YXRJZgWC1EAn1Kw'
    })

if (useOfficialNotionAPI) {
  console.log('Using official Notion API', process.env.NOTION_TOKEN)
  console.warn(
    'Using the official Notion API. Note that many blocks only include partial support for formatting and layout. Use at your own risk.'
  )
}

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  const recordMap = await notion.getPage(pageId, {
    fetchRelationPages: true,
    fetchDatabaseEntries: true, // For official API (v5)
    fetchCollections: true // For unofficial API (v3) - populates collection_query
  } as any)

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
