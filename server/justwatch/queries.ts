const TITLE_FIELDS = `
  id
  objectType
  content(country: $country, language: $language) {
    title
    fullPath
    originalReleaseYear
    originalReleaseDate
    runtime
    shortDescription
    genres {
      shortName
      translation(language: $language)
    }
    externalIds {
      imdbId
      tmdbId
    }
    posterUrl
    ageCertification
    scoring {
      imdbScore
      imdbVotes
      tmdbScore
      tmdbPopularity
      jwRating
    }
  }
  offers(country: $country, platform: WEB) {
    id
    monetizationType
    presentationType
    retailPrice(language: $language)
    retailPriceValue
    currency
    standardWebURL
    package {
      packageId
      clearName
      technicalName
      icon
    }
    availableTo
  }
`;

export const GET_POPULAR_TITLES = `
  query GetPopularTitles(
    $country: Country!
    $language: Language!
    $first: Int!
    $after: String
    $filter: TitleFilter
    $sortBy: PopularTitlesSorting!
  ) {
    popularTitles(
      country: $country
      first: $first
      after: $after
      filter: $filter
      sortBy: $sortBy
    ) {
      edges {
        node {
          ${TITLE_FIELDS}
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalCount
    }
  }
`;

export const SEARCH_TITLES = `
  query SearchTitles(
    $country: Country!
    $language: Language!
    $first: Int!
    $after: String
    $searchQuery: String!
  ) {
    popularTitles(
      country: $country
      first: $first
      after: $after
      filter: { searchQuery: $searchQuery }
      sortBy: POPULAR
    ) {
      edges {
        node {
          ${TITLE_FIELDS}
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalCount
    }
  }
`;
