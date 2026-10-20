/**
 * A minimal ZIP writer, no dependencies.
 *
 * Everything the app packs here (audio, a PDF) is either already compressed or
 * small, so the only method used is *store* (compression method 0). That keeps
 * the writer to a few well-defined structures from APPNOTE.TXT rather than a
 * DEFLATE implementation:
 *
 *   [local file header + data] * n   [central directory]   [end of central directory]
 *
 * CRC-32 is required even in store mode (readers verify it), so it is computed
 * here rather than skipped. Filenames are UTF-8 and the language-encoding flag
 * (bit 11) is set so non-ASCII names survive.
 */

export interface ZipEntry {
  /** Path inside the archive, forward slashes, e.g. "audio/clip.wav". */
  path: string
  data: Uint8Array
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
/** Bit 11: file name is UTF-8. */
const UTF8_FLAG = 0x0800
const VERSION_NEEDED = 20
const STORE_METHOD = 0

const textEncoder = new TextEncoder()

let crcTable: Uint32Array | null = null

/** The standard reflected CRC-32 table (polynomial 0xEDB88320), built once. */
function crc32Table(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  crcTable = table
  return table
}

export function crc32(bytes: Uint8Array): number {
  const table = crc32Table()
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS packed date and time, as the ZIP format stores them. */
function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosTime, dosDate }
}

/** A grown-on-demand little-endian byte sink. */
class ByteWriter {
  private bytes = new Uint8Array(1024)
  private view = new DataView(this.bytes.buffer)
  private length = 0

  private ensure(additional: number): void {
    if (this.length + additional <= this.bytes.length) return
    let capacity = this.bytes.length * 2
    while (capacity < this.length + additional) capacity *= 2
    const grown = new Uint8Array(capacity)
    grown.set(this.bytes.subarray(0, this.length))
    this.bytes = grown
    this.view = new DataView(this.bytes.buffer)
  }

  uint16(value: number): void {
    this.ensure(2)
    this.view.setUint16(this.length, value & 0xffff, true)
    this.length += 2
  }

  uint32(value: number): void {
    this.ensure(4)
    this.view.setUint32(this.length, value >>> 0, true)
    this.length += 4
  }

  bytesOf(data: Uint8Array): void {
    this.ensure(data.length)
    this.bytes.set(data, this.length)
    this.length += data.length
  }

  /** Bytes written so far, without copying; used for central-directory offsets. */
  finishLength(): number {
    return this.length
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length)
  }
}

/**
 * Builds a complete ZIP archive in memory. Entries keep the order given. A
 * modification timestamp can be supplied so the archive is byte-for-byte
 * reproducible in tests; it defaults to now.
 */
export function createZipArchive(entries: readonly ZipEntry[], modifiedAt: Date = new Date()): Uint8Array {
  const { dosTime, dosDate } = toDosDateTime(modifiedAt)
  const writer = new ByteWriter()
  const directoryOffsets: { nameBytes: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.path)
    const offset = writer.finishLength()
    const crc = crc32(entry.data)

    // Local file header.
    writer.uint32(LOCAL_FILE_HEADER_SIGNATURE)
    writer.uint16(VERSION_NEEDED)
    writer.uint16(UTF8_FLAG)
    writer.uint16(STORE_METHOD)
    writer.uint16(dosTime)
    writer.uint16(dosDate)
    writer.uint32(crc)
    writer.uint32(entry.data.length)
    writer.uint32(entry.data.length)
    writer.uint16(nameBytes.length)
    writer.uint16(0) // extra field length
    writer.bytesOf(nameBytes)
    writer.bytesOf(entry.data)

    directoryOffsets.push({ nameBytes, crc, size: entry.data.length, offset })
  }

  const centralDirectoryOffset = writer.finishLength()
  for (const record of directoryOffsets) {
    writer.uint32(CENTRAL_DIRECTORY_SIGNATURE)
    writer.uint16(VERSION_NEEDED) // version made by
    writer.uint16(VERSION_NEEDED) // version needed to extract
    writer.uint16(UTF8_FLAG)
    writer.uint16(STORE_METHOD)
    writer.uint16(dosTime)
    writer.uint16(dosDate)
    writer.uint32(record.crc)
    writer.uint32(record.size)
    writer.uint32(record.size)
    writer.uint16(record.nameBytes.length)
    writer.uint16(0) // extra field length
    writer.uint16(0) // comment length
    writer.uint16(0) // disk number start
    writer.uint16(0) // internal attributes
    writer.uint32(0) // external attributes
    writer.uint32(record.offset)
    writer.bytesOf(record.nameBytes)
  }
  const centralDirectorySize = writer.finishLength() - centralDirectoryOffset

  writer.uint32(END_OF_CENTRAL_DIRECTORY_SIGNATURE)
  writer.uint16(0) // this disk
  writer.uint16(0) // disk with the central directory
  writer.uint16(directoryOffsets.length)
  writer.uint16(directoryOffsets.length)
  writer.uint32(centralDirectorySize)
  writer.uint32(centralDirectoryOffset)
  writer.uint16(0) // comment length

  return writer.finish()
}
