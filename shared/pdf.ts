/**
 * A minimal PDF writer, no dependencies.
 *
 * The report is text: headings, paragraphs, and lists. That is small enough to
 * emit directly as PDF content-stream operators using the two standard 14 fonts
 * (Helvetica and Helvetica-Bold) with WinAnsiEncoding, so there is no font to
 * embed and no layout engine to bring in. The writer handles the parts that are
 * easy to get subtly wrong: string escaping, CP1252 encoding, word wrap,
 * automatic pagination, and a correct cross-reference table.
 *
 * Text is laid out top-down; `cursor` is the distance from the top of the page to
 * the baseline of the next line. Everything is measured with Helvetica metrics so
 * a line never runs past the right margin.
 */

// Helvetica advance widths for the printable ASCII range (32..126), in 1/1000 em.
// From the standard Adobe Font Metrics; the two tables keep wrapping honest.
const HELVETICA_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
]

const HELVETICA_BOLD_WIDTHS: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
]

const DEFAULT_CHAR_WIDTH = 556

/** Unicode punctuation that lives above the Latin-1 range, mapped to its CP1252 byte. */
const WIN_ANSI_EXTRAS: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f, 0x2010: 0x2d, 0x2011: 0x2d, 0x2212: 0x2d, 0x00a0: 0x20, 0x2028: 0x20,
  0x2029: 0x20,
}

/**
 * Converts arbitrary text to a string whose code points are all WinAnsi byte
 * values. Characters the font cannot show (emoji, most non-Latin scripts) become
 * "?", which is honest about what the page can render.
 */
export function encodeWinAnsi(text: string): string {
  let result = ''
  for (const character of text) {
    const code = character.codePointAt(0)!
    if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) {
      result += String.fromCharCode(code)
      continue
    }
    const mapped = WIN_ANSI_EXTRAS[code]
    result += mapped === undefined ? '?' : String.fromCharCode(mapped)
  }
  return result
}

function charWidth(winAnsiCode: number, bold: boolean): number {
  if (winAnsiCode >= 32 && winAnsiCode <= 126) {
    return (bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS)[winAnsiCode - 32]!
  }
  return DEFAULT_CHAR_WIDTH
}

/** The rendered width of a string in points, using Helvetica metrics. */
export function measureTextWidth(text: string, fontSize: number, bold = false): number {
  const encoded = encodeWinAnsi(text)
  let totalWidth = 0
  for (let index = 0; index < encoded.length; index += 1) {
    totalWidth += charWidth(encoded.charCodeAt(index), bold)
  }
  return (totalWidth / 1000) * fontSize
}

function escapePdfString(winAnsiText: string): string {
  return winAnsiText.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes
}

export interface PdfParagraphOptions {
  size?: number
  bold?: boolean
  leading?: number
  indent?: number
  /**
   * Extra left indent applied to every line after the first, so wrapped text
   * hangs under the text that starts the paragraph (a bullet, or a label).
   */
  hangingIndent?: number
  spaceBefore?: number
  spaceAfter?: number
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 56

export class PdfWriter {
  private readonly pageStreams: string[] = ['']
  private cursor = MARGIN + 12
  private isFinished = false

  constructor(private readonly documentTitle: string) {}

  private get usableWidth(): number {
    return PAGE_WIDTH - MARGIN * 2
  }

  private pageBottom(): number {
    return PAGE_HEIGHT - MARGIN
  }

  private startNewPage(): void {
    this.pageStreams.push('')
    this.cursor = MARGIN + 12
  }

  private ensureSpace(needed: number): void {
    if (this.cursor + needed > this.pageBottom()) this.startNewPage()
  }

  private appendToCurrentPage(operator: string): void {
    const index = this.pageStreams.length - 1
    const existing = this.pageStreams[index]!
    this.pageStreams[index] = existing === '' ? operator : `${existing}\n${operator}`
  }

  private drawLine(text: string, size: number, bold: boolean, indent: number): void {
    const encoded = escapePdfString(encodeWinAnsi(text))
    const font = bold ? 'F2' : 'F1'
    const yFromBottom = PAGE_HEIGHT - this.cursor
    this.appendToCurrentPage(
      `BT /${font} ${size} Tf 1 0 0 1 ${(MARGIN + indent).toFixed(2)} ${yFromBottom.toFixed(2)} Tm (${encoded}) Tj ET`,
    )
    this.cursor += size * 1.42
  }

  /** Wraps text to the usable width, honouring explicit newlines and hard-breaking long words. */
  private wrap(text: string, size: number, bold: boolean, firstIndent: number, continuationIndent: number): string[] {
    const maxWidth = this.usableWidth - Math.max(firstIndent, continuationIndent)
    const lines: string[] = []
    for (const logicalLine of text.split('\n')) {
      if (logicalLine.trim() === '') {
        lines.push('')
        continue
      }
      let line = ''
      for (const word of logicalLine.split(/\s+/).filter(Boolean)) {
        const candidate = line === '' ? word : `${line} ${word}`
        if (measureTextWidth(candidate, size, bold) <= maxWidth) {
          line = candidate
          continue
        }
        if (line !== '') lines.push(line)
        if (measureTextWidth(word, size, bold) > maxWidth) {
          // A single word wider than the column is broken character by character.
          let fragment = ''
          for (const character of word) {
            if (fragment !== '' && measureTextWidth(fragment + character, size, bold) > maxWidth) {
              lines.push(fragment)
              fragment = character
            } else {
              fragment += character
            }
          }
          line = fragment
        } else {
          line = word
        }
      }
      lines.push(line)
    }
    return lines
  }

  paragraph(text: string, options: PdfParagraphOptions = {}): void {
    const size = options.size ?? 10.5
    const bold = options.bold ?? false
    const firstIndent = options.indent ?? 0
    const continuationIndent = firstIndent + (options.hangingIndent ?? 0)
    const leading = options.leading ?? size * 1.42
    if (options.spaceBefore) this.cursor += options.spaceBefore
    const lines = this.wrap(text, size, bold, firstIndent, continuationIndent)
    lines.forEach((line, index) => {
      this.ensureSpace(leading)
      if (line === '') {
        this.cursor += leading * 0.5
        return
      }
      this.drawLine(line, size, bold, index === 0 ? firstIndent : continuationIndent)
    })
    if (options.spaceAfter) this.cursor += options.spaceAfter
  }

  heading(text: string, level: 1 | 2 = 2): void {
    this.paragraph(text, {
      size: level === 1 ? 17 : 12.5,
      bold: true,
      leading: level === 1 ? 22 : 17,
      spaceBefore: level === 1 ? 2 : 12,
      spaceAfter: 3,
    })
  }

  bullets(items: readonly string[]): void {
    for (const item of items) {
      this.paragraph(`• ${item}`, { indent: 12, hangingIndent: 12, leading: 15 })
    }
  }

  /**
   * A labelled value, hanging under the value so a long one wraps tidily rather
   * than back to the margin.
   */
  labelled(label: string, value: string): void {
    const size = 10.5
    const hangingIndent = Math.max(0, measureTextWidth(`${label}: `, size))
    this.paragraph(`${label}: ${value}`, { indent: 12, hangingIndent, leading: 15 })
  }

  rule(): void {
    this.cursor += 4
    this.ensureSpace(6)
    const yFromBottom = PAGE_HEIGHT - this.cursor
    this.appendToCurrentPage(
      `0.6 w 0.6 0.6 0.6 RG ${MARGIN} ${yFromBottom.toFixed(2)} m ${PAGE_WIDTH - MARGIN} ${yFromBottom.toFixed(2)} l S`,
    )
    this.cursor += 8
  }

  spacer(points = 8): void {
    this.cursor += points
  }

  pageBreak(): void {
    this.startNewPage()
  }

  finish(): Uint8Array {
    if (this.isFinished) throw new Error('This PDF has already been finished.')
    this.isFinished = true

    const pageContents = this.pageStreams.map((stream) => (stream === '' ? '\n' : stream))
    const pageCount = pageContents.length

    // Object numbering: 1 catalog, 2 pages, 3/4 fonts, then page/content pairs
    // from 5, and an info dictionary last.
    const bodies: string[] = []
    bodies.push('<< /Type /Catalog /Pages 2 0 R >>')
    const kids = Array.from({ length: pageCount }, (_value, index) => `${5 + index * 2} 0 R`).join(' ')
    bodies.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`)
    bodies.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    bodies.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

    pageContents.forEach((content, index) => {
      const contentObjectNumber = 6 + index * 2
      bodies.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      )
      const contentLength = latin1Bytes(content).length
      bodies.push(`<< /Length ${contentLength} >>\nstream\n${content}\nendstream`)
    })

    const infoObjectNumber = bodies.length + 1
    bodies.push(`<< /Title (${escapePdfString(encodeWinAnsi(this.documentTitle))}) /Producer (Resonate) >>`)

    const parts: string[] = ['%PDF-1.4\n']
    const offsets: number[] = []
    let offset = latin1Bytes(parts[0]!).length
    bodies.forEach((body, index) => {
      offsets.push(offset)
      const chunk = `${index + 1} 0 obj\n${body}\nendobj\n`
      parts.push(chunk)
      offset += latin1Bytes(chunk).length
    })

    const xrefOffset = offset
    const xrefLines = [`xref\n0 ${bodies.length + 1}\n`, '0000000000 65535 f \n']
    for (const objectOffset of offsets) {
      xrefLines.push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`)
    }
    const trailer =
      `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R /Info ${infoObjectNumber} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`

    return latin1Bytes(parts.join('') + xrefLines.join('') + trailer)
  }
}

export function createPdfWriter(title: string): PdfWriter {
  return new PdfWriter(title)
}
