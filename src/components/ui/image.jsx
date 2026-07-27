import * as React from "react"
import { cn } from "@/lib/utils"

// Inline SVG placeholder — no external CDN dependency.
const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#1a1a2e" width="100%" height="100%"/></svg>'
  )

/**
 * Image with lazy loading and error fallback.
 * Accepts fittingType / originWidth / originHeight for layout compatibility.
 */
const Image = React.forwardRef(
  (
    {
      src,
      fittingType = "fill",
      originWidth,
      originHeight,
      focalPointX: _focalPointX,
      focalPointY: _focalPointY,
      quality: _quality,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const [imgSrc, setImgSrc] = React.useState(src || PLACEHOLDER)

    React.useEffect(() => {
      setImgSrc(src || PLACEHOLDER)
    }, [src])

    const objectClass = fittingType === "fit" ? "object-contain" : "object-cover"
    const aspectRatio =
      originWidth && originHeight ? `${originWidth} / ${originHeight}` : undefined

    if (!src) {
      return (
        <img
          ref={ref}
          src={PLACEHOLDER}
          alt=""
          className={cn(objectClass, className)}
          style={{ aspectRatio, ...style }}
          data-empty-image
          {...props}
        />
      )
    }

    return (
      <img
        ref={ref}
        src={imgSrc}
        loading="lazy"
        className={cn(objectClass, className)}
        style={{ aspectRatio, ...style }}
        onError={() => setImgSrc(PLACEHOLDER)}
        data-error-image={imgSrc === PLACEHOLDER ? true : undefined}
        {...props}
      />
    )
  }
)
Image.displayName = "Image"

export { Image }
