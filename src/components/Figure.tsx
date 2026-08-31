import useBaseUrl from '@docusaurus/useBaseUrl';
import React, {type ReactNode} from 'react';

type FigureProps = {
  /** Path under static/, e.g. "img/helixid-flow.svg". No leading slash. */
  src: string;
  alt: string;
  /** Optional caption rendered under the image. */
  children?: ReactNode;
  /** Optional path to a larger/standalone version, also under static/. */
  fullSrc?: string;
  /** Set for diagrams that carry their own light background. */
  light?: boolean;
  /** Intrinsic size, so the browser reserves the right box before load. */
  width?: number;
  height?: number;
};

/**
 * Image figure that is baseUrl-aware.
 *
 * Always use this instead of a raw <img src="/img/...">: a leading-slash path
 * ignores baseUrl and 404s whenever the site is served from a subpath, which
 * is exactly what happens on the default GitHub Pages URL.
 */
export default function Figure({
  src,
  alt,
  children,
  fullSrc,
  light,
  width,
  height,
}: FigureProps): ReactNode {
  const resolved = useBaseUrl(src);
  const resolvedFull = useBaseUrl(fullSrc ?? src);

  return (
    <figure className={light ? 'helix-figure helix-figure--light' : 'helix-figure'}>
      <img
        src={resolved}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
      />
      {(children || fullSrc) && (
        <figcaption>
          {children}
          {fullSrc && (
            <>
              {children ? ' ' : ''}
              <a href={resolvedFull} target="_blank" rel="noopener noreferrer">
                Open the full-size version
              </a>
              .
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
