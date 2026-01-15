import { type ExtendedRecordMap } from 'notion-types'

import { NotionPage } from '../components/NotionPage'
import {
  previewImagesEnabled,
  rootDomain,
  rootNotionPageId,
  rootNotionSpaceId
} from '../lib/config'
import * as notion from '../lib/notion'

export const getServerSideProps = async (context: any) => {
  const searchParams = context.query || {}
  const notionAPI = notion.createNotionAPI(searchParams)
  const pageId = context.params.pageId as string
  const recordMap = await notionAPI.getPage(pageId)

  // NOTE: this isn't necessary; trying to reduce my vercel bill
  const blockIds = Object.keys(recordMap.block)
  const firstBlock = blockIds.length > 0 ? recordMap.block[blockIds[0]!] : null
  if (rootNotionSpaceId && firstBlock?.value?.space_id !== rootNotionSpaceId) {
    return {
      notFound: true
    }
  }

  return {
    props: {
      recordMap
    }
  }
}

export default function Page({ recordMap }: { recordMap: ExtendedRecordMap }) {
  console.log(JSON.stringify(recordMap))

  return (
    <NotionPage
      recordMap={recordMap}
      rootDomain={rootDomain}
      rootPageId={rootNotionPageId}
      previewImagesEnabled={previewImagesEnabled}
    />
  )
}
