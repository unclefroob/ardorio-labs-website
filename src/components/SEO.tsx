import { Helmet } from 'react-helmet-async'

const SITE_NAME = 'Ardorio'
const BASE_URL = 'https://ardorio.co'
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`
const DEFAULT_DESCRIPTION =
  'Ardorio builds technology for Australian enterprises and founders, across AI engineering, enterprise platforms, and startup product development from idea to launch.'

interface SEOProps {
  title?: string
  description?: string
  canonical: string
  ogImage?: string
  type?: 'website' | 'article'
}

export default function SEO({
  title,
  description,
  canonical,
  ogImage,
  type = 'website',
}: SEOProps) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} | Technology built for enterprises and founders`
  const desc = description || DEFAULT_DESCRIPTION
  const url = `${BASE_URL}${canonical}`
  // Absolutise a relative ogImage (e.g. "/newsroom/x.png") so social crawlers resolve it.
  const rawImage = ogImage || DEFAULT_OG_IMAGE
  const image = rawImage.startsWith('http') ? rawImage : `${BASE_URL}${rawImage}`

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_AU" />

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  )
}
