import type * as notion from 'notion-types'

import type * as types from './types'
import { convertRichText } from './convert-rich-text'

/**
 * Convert official API Database to notion-types Collection
 */
export function convertDatabaseToCollection(
  database: types.PartialDatabase,
  dataSource: types.DataSource
): notion.Collection {
  const schema: notion.CollectionPropertySchemaMap = {}

  // Convert properties from data source to collection schema
  for (const [, property] of Object.entries(dataSource.properties)) {
    const schemaProperty: notion.CollectionPropertySchema = {
      name: property.name,
      type: property.type as notion.PropertyType
    }

    // Handle specific property types
    switch (property.type) {
      case 'title':
        schemaProperty.type = 'title'
        break
      case 'rich_text':
        schemaProperty.type = 'text'
        break
      case 'number':
        schemaProperty.type = 'number'
        if (property.number?.format) {
          schemaProperty.number_format = property.number
            .format as notion.NumberFormat
        }
        break
      case 'select':
        schemaProperty.type = 'select'
        if (property.select?.options) {
          schemaProperty.options = property.select.options.map((option) => ({
            id: option.id,
            color: option.color as notion.Color,
            value: option.name
          }))
        }
        break
      case 'multi_select':
        schemaProperty.type = 'multi_select'
        if (property.multi_select?.options) {
          schemaProperty.options = property.multi_select.options.map(
            (option) => ({
              id: option.id,
              color: option.color as notion.Color,
              value: option.name
            })
          )
        }
        break
      case 'date':
        schemaProperty.type = 'date'
        break
      case 'people':
        schemaProperty.type = 'person'
        break
      case 'checkbox':
        schemaProperty.type = 'checkbox'
        break
      case 'url':
        schemaProperty.type = 'url'
        break
      case 'email':
        schemaProperty.type = 'email'
        break
      case 'phone_number':
        schemaProperty.type = 'phone_number'
        break
      default:
        // Handle unknown types as text for now
        schemaProperty.type = 'text'
    }

    schema[property.id] = schemaProperty
  }

  const collection: notion.Collection = {
    id: dataSource.id,
    version: 1,
    name: convertRichText((database as any).title || []),
    schema,
    icon:
      (database as any).icon?.type === 'emoji'
        ? (database as any).icon.emoji
        : '',
    parent_id: (database as any).parent?.block_id || '',
    parent_table: 'block',
    alive: !(database as any).in_trash,
    copied_from: '',
    format: {
      property_visibility: Object.keys(dataSource.properties).map(
        (propertyId) => ({
          property: propertyId,
          visibility: 'show' as const
        })
      )
    }
  }

  return collection
}

/**
 * Create a default gallery collection view
 */
export function createDefaultCollectionView(
  collectionId: string,
  _dataSource: types.DataSource
): notion.CollectionView {
  const viewId = `${collectionId}`

  const galleryView: notion.GalleryCollectionView = {
    id: viewId,
    type: 'gallery',
    name: 'Gallery',
    format: {
      gallery_cover: { type: 'page_cover' },
      gallery_cover_size: 'small',
      gallery_cover_aspect: 'cover',
      gallery_properties: [{ visible: true, property: 'title' }]
    },
    version: 1,
    alive: true,
    parent_id: collectionId,
    parent_table: 'collection',
    query2: {
      aggregations: [{ aggregator: 'count' }],
      group_by: 'title'
    }
  }

  return galleryView
}

/**
 * Convert data source query results to CollectionQueryResult
 */
export function convertDataSourceQueryToQueryResult(
  queryResponse: types.DataSourceQuery,
  _viewId: string
): notion.CollectionQueryResult {
  // Use the order from query results as the API should return sorted results
  const orderedBlockIds = queryResponse.results
    .filter((result) => result.object === 'page')
    .map((result) => result.id)

  const queryResult: notion.CollectionQueryResult = {
    type: 'gallery',
    total: orderedBlockIds.length,
    blockIds: orderedBlockIds,
    aggregationResults: [],
    collection_group_results: {
      type: 'results',
      blockIds: orderedBlockIds,
      hasMore: queryResponse.has_more || false
    }
  }

  return queryResult
}
