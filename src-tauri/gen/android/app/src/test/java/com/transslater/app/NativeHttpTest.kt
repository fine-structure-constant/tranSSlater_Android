package com.transslater.app

import java.net.ServerSocket
import java.net.URL
import java.util.zip.GZIPOutputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import org.junit.Assert.*
import org.junit.Test

class NativeHttpTest {
  @Test fun getsEncodedQueriesHeadersAndGzipWithoutLosingUnicode() {
    ServerSocket(0).use { server ->
      val worker = Executors.newSingleThreadExecutor()
      val request = worker.submit<String> {
        server.accept().use { socket ->
          val reader = socket.getInputStream().bufferedReader()
          val headers = generateSequence { reader.readLine()?.takeIf { it.isNotEmpty() } }.joinToString("\n")
          val out = ByteArrayOutputStream()
          GZIPOutputStream(out).use { it.write("{\"translation\":[\"你好\"]}".toByteArray()) }
          val body = out.toByteArray()
          socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: gzip\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n").toByteArray() + body)
          headers
        }
      }
      try {
        val response = NativeHttp.get(URL("http://127.0.0.1:${server.localPort}/?q=hello%20world"), "https://dict.youdao.com/")
        assertEquals(200, response.status)
        assertTrue(response.body.contains("你好"))
        assertTrue(request.get().contains("q=hello%20world"))
        assertTrue(request.get().contains("Referer: https://dict.youdao.com/"))
      } finally { worker.shutdownNow() }
    }
  }

  @Test fun preservesHttpFailuresAndExplainsConnectionFailures() {
    ServerSocket(0).use { server ->
      val worker = Executors.newSingleThreadExecutor()
      val served = worker.submit {
        server.accept().use { socket ->
          val reader = socket.getInputStream().bufferedReader()
          while (!reader.readLine().isNullOrEmpty()) { }
          socket.getOutputStream().write("HTTP/1.1 429 Too Many Requests\r\nContent-Length: 4\r\nConnection: close\r\n\r\nslow".toByteArray())
        }
      }
      try {
        val response = NativeHttp.get(URL("http://127.0.0.1:${server.localPort}"))
        assertEquals(429, response.status)
        assertEquals("slow", response.body)
        served.get()
      } finally { worker.shutdownNow() }
    }
    assertTrue(NativeHttp.describe(java.net.UnknownHostException(), "example.com").contains("DNS"))
    assertTrue(NativeHttp.describe(javax.net.ssl.SSLHandshakeException("failed"), "example.com").contains("证书"))
    assertTrue(NativeHttp.describe(java.net.SocketTimeoutException(), "example.com").contains("超时"))
    assertTrue(NativeHttp.describe(java.net.SocketException("Permission denied"), "example.com").contains("系统阻止"))
  }

  @Test fun allThreeHostsHonorTheSystemConnectionPolicy() {
    ServerSocket(0).use { server ->
      val original = java.net.ProxySelector.getDefault()
      val worker = Executors.newSingleThreadExecutor()
      val seen = worker.submit<List<String>> {
        (1..3).map {
          server.accept().use { socket ->
            val reader = socket.getInputStream().bufferedReader()
            val first = reader.readLine()
            while (!reader.readLine().isNullOrEmpty()) { }
            socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".toByteArray())
            first
          }
        }
      }
      java.net.ProxySelector.setDefault(object : java.net.ProxySelector() {
        override fun select(uri: java.net.URI): List<java.net.Proxy> = listOf(java.net.Proxy(java.net.Proxy.Type.HTTP, java.net.InetSocketAddress("127.0.0.1", server.localPort)))
        override fun connectFailed(uri: java.net.URI, address: java.net.SocketAddress, error: java.io.IOException) { }
      })
      try {
        val hosts = listOf("dict.youdao.com", "aidemo.youdao.com", "translate.googleapis.com")
        for (host in hosts) assertEquals(200, NativeHttp.get(URL("http://$host/test")).status)
        val requests = seen.get(5, java.util.concurrent.TimeUnit.SECONDS)
        for ((index, host) in hosts.withIndex()) assertTrue(requests[index].contains("http://$host/test"))
      } finally {
        java.net.ProxySelector.setDefault(original)
        worker.shutdownNow()
      }
    }
  }

  @Test fun connectionDetailsRetainTheCauseButExcludeQueriesAndCredentials() {
    val error = java.net.ConnectException("failed to connect to dict.youdao.com/1.2.3.4:443")
    error.initCause(java.io.IOException("request https://user:password@dict.youdao.com/jsonapi?q=private-word failed"))
    val detail = NativeHttp.details(error)
    assertTrue(detail.contains("1.2.3.4:443"))
    assertTrue(detail.contains("IOException"))
    assertFalse(detail.contains("password"))
    assertFalse(detail.contains("private-word"))
  }

  @Test fun liveProviderConnections() {
    org.junit.Assume.assumeTrue(System.getProperty("transslater.live") == "true")
    val queries = listOf(
      "https://dict.youdao.com/jsonapi?q=hello",
      "https://aidemo.youdao.com/trans?q=Hello%20world&from=en&to=zh-CHS",
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=hello"
    )
    for (address in queries) {
      val url = URL(address)
      val response = NativeHttp.get(url, "https://dict.youdao.com/")
      assertTrue("${url.host}: HTTP ${response.status}", response.status == 200 || response.status == 429)
      assertTrue("${url.host}: empty response", response.body.isNotBlank())
      println("${url.host}: HTTP ${response.status}, ${response.body.length} characters")
    }
  }
}
