package com.transslater.app

import java.io.ByteArrayInputStream
import java.nio.charset.Charset
import org.junit.Assert.*
import org.junit.Test

class ExternalTextTest {
  @Test fun decodesTheDesktopFileEncodings() {
    val text = "中文 hello"
    assertEquals(text, ExternalText.decode(text.toByteArray()))
    assertEquals(text, ExternalText.decode(byteArrayOf(0xef.toByte(), 0xbb.toByte(), 0xbf.toByte()) + text.toByteArray()))
    assertEquals(text, ExternalText.decode(byteArrayOf(0xff.toByte(), 0xfe.toByte()) + text.toByteArray(Charsets.UTF_16LE)))
    assertEquals(text, ExternalText.decode(byteArrayOf(0xfe.toByte(), 0xff.toByte()) + text.toByteArray(Charsets.UTF_16BE)))
    assertEquals(text, ExternalText.decode(text.toByteArray(Charset.forName("GBK"))))
  }

  @Test fun truncatesSelectionsWithoutBreakingUnicode() {
    val result = ExternalText.limit("😀".repeat(5001))
    assertEquals(5000, result.codePointCount(0, result.length))
    assertEquals("😀".repeat(5000), result)
  }

  @Test fun rejectsEmptyBinaryAndOversizedDocuments() {
    for (bytes in listOf(byteArrayOf(), " \n ".toByteArray(), byteArrayOf(0, 1, 2), ByteArray(ExternalText.MAX_BYTES + 1) { 65 })) {
      try { ExternalText.read(ByteArrayInputStream(bytes)); fail("Invalid file accepted") }
      catch (_: IllegalArgumentException) { }
    }
    assertEquals(5000, ExternalText.read(ByteArrayInputStream(ByteArray(ExternalText.MAX_BYTES) { 65 })).length)
  }
}
