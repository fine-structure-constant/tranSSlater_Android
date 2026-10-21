package com.transslater.app

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

/** Same limits and encodings as the desktop text-file/selection entry points. */
object ExternalText {
  const val MAX_BYTES = 512 * 1024
  const val MAX_CHARS = 5000

  fun limit(text: String): String {
    val value = text.trim()
    require(value.isNotEmpty()) { "没有可翻译的文字" }
    val count = value.codePointCount(0, value.length)
    return if (count > MAX_CHARS) value.substring(0, value.offsetByCodePoints(0, MAX_CHARS)) else value
  }

  fun read(stream: InputStream): String {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
      val size = stream.read(buffer)
      if (size < 0) break
      require(out.size() + size <= MAX_BYTES) { "文件超过 512 KB，请先截取一段再翻译" }
      out.write(buffer, 0, size)
    }
    return decode(out.toByteArray())
  }

  fun decode(bytes: ByteArray): String {
    require(bytes.size <= MAX_BYTES) { "文件超过 512 KB，请先截取一段再翻译" }
    fun starts(vararg prefix: Int) = bytes.size >= prefix.size && prefix.indices.all { bytes[it].toInt() and 255 == prefix[it] }
    val text = when {
      starts(0xef, 0xbb, 0xbf) -> String(bytes, 3, bytes.size - 3, Charsets.UTF_8)
      starts(0xff, 0xfe) -> String(bytes, 2, bytes.size - 2, Charsets.UTF_16LE)
      starts(0xfe, 0xff) -> String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
      else -> {
        require(!bytes.contains(0.toByte())) { "这看起来是二进制文件，不是文本" }
        try {
          Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: CharacterCodingException) {
          String(bytes, Charset.forName("GBK"))
        }
      }
    }
    return limit(text)
  }
}
