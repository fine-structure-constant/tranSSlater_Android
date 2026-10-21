package com.transslater.app

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/** Uses Android's resolver and default TLS trust manager; never disables verification. */
object NativeHttp {
  data class Response(val status: Int, val body: String)
  const val MAX_RESPONSE_BYTES = 8 * 1024 * 1024
  private const val USER_AGENT = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

  fun get(url: URL, referer: String? = null): Response {
    // The Android network policy applies equally to every engine. NO_PROXY here
    // bypassed that policy for Youdao even when the same URL worked in a browser.
    val connection = url.openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 12000
      connection.readTimeout = 18000
      connection.instanceFollowRedirects = false
      connection.useCaches = false
      connection.setRequestProperty("User-Agent", USER_AGENT)
      connection.setRequestProperty("Accept", "application/json")
      if (referer != null) connection.setRequestProperty("Referer", referer)
      val status = connection.responseCode
      val raw = if (status in 200..299) connection.inputStream else connection.errorStream
      val body = if (raw == null) "" else raw.use {
        val stream = if (connection.contentEncoding.equals("gzip", true)) GZIPInputStream(it) else it
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        val deadline = System.nanoTime() + 30_000_000_000L
        while (true) {
          if (System.nanoTime() > deadline) throw java.net.SocketTimeoutException("读取超时")
          val count = stream.read(buffer)
          if (count < 0) break
          require(out.size() + count <= MAX_RESPONSE_BYTES) { "翻译服务返回的数据过大" }
          out.write(buffer, 0, count)
        }
        out.toString("UTF-8")
      }
      return Response(status, body)
    } finally { connection.disconnect() }
  }

  /** Preserve the connection cause without including the user's query or credentials. */
  fun details(error: Exception): String {
    val causes = generateSequence<Throwable>(error) { it.cause }.take(4).map {
      val message = it.message.orEmpty().replace(Regex("https?://[^\\s)]+")) { match ->
        try { URL(match.value).host } catch (_: Exception) { "翻译服务" }
      }
      "${it.javaClass.simpleName}: $message".trim()
    }.distinct().joinToString(" → ")
    return causes.take(800)
  }

  fun describe(error: Exception, host: String): String = when (error) {
    is java.net.UnknownHostException -> "无法解析 $host，请检查手机网络或私人 DNS 设置"
    is javax.net.ssl.SSLException -> "与 $host 的安全连接失败，请检查手机日期和网络证书"
    is java.net.SocketTimeoutException -> "连接 $host 超时，请检查手机网络或 VPN 后重试"
    is java.net.ConnectException -> "无法连接 $host，请检查手机的联网权限、网络或 VPN"
    is java.net.SocketException -> if (error.message.orEmpty().contains("Permission denied", true) || error.message.orEmpty().contains("EACCES", true)) {
      "系统阻止了应用联网，请在系统设置中允许 tranSSlater 使用 WLAN 和移动数据"
    } else { "访问 $host 失败，网络连接中断，请检查网络或 VPN 后重试" }
    is SecurityException -> "应用未获准联网，请在系统设置中允许 tranSSlater 使用网络"
    else -> "访问 $host 失败（${error.javaClass.simpleName}），请检查网络后重试"
  }
}
