import { type ExtendedRecordMap } from 'notion-types'

import { NotionPage } from '../components/NotionPage'
import {
  previewImagesEnabled,
  rootDomain,
  rootNotionPageId
} from '../lib/config'
import * as notion from '../lib/notion'

export const getServerSideProps = async (context: any) => {
  const searchParams = context.query || {}
  const notionAPI = notion.createNotionAPI(searchParams)
  const pageId = rootNotionPageId
  const recordMap = await notionAPI.getPage(pageId)

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
