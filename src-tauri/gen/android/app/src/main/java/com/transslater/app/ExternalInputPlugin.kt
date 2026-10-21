package com.transslater.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** No clipboard polling or overlays: only text explicitly handed to this app. */
@TauriPlugin
class ExternalInputPlugin(private val activity: Activity) : Plugin(activity) {
  private val pending = AtomicReference<JSObject?>(null)
  private val generation = AtomicLong()
  private val reader = Executors.newSingleThreadExecutor()
  private var webView: WebView? = null

  override fun load(webView: WebView) {
    this.webView = webView
    receive(activity.intent)
  }

  override fun onNewIntent(intent: Intent) { receive(intent) }

  @Command
  fun take(invoke: Invoke) { invoke.resolve(pending.getAndSet(null) ?: JSObject()) }

  @Suppress("DEPRECATION")
  private fun receive(intent: Intent?) {
    if (intent == null || intent.action !in setOf(Intent.ACTION_PROCESS_TEXT, Intent.ACTION_SEND, Intent.ACTION_VIEW)) return
    val incoming = Intent(intent)
    // Consumed once even if the WebView is recreated later.
    intent.action = null
    val request = generation.incrementAndGet()
    reader.execute {
      val payload = JSObject()
      try {
        val text = when (incoming.action) {
          Intent.ACTION_PROCESS_TEXT -> incoming.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
          Intent.ACTION_SEND -> incoming.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
            ?: readFile(incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
          Intent.ACTION_VIEW -> readFile(incoming.data)
          else -> null
        }
        payload.put("text", ExternalText.limit(text ?: ""))
      } catch (error: Exception) {
        payload.put("error", error.message ?: "无法读取收到的文字或文件")
      }
      if (generation.get() == request) {
        pending.set(payload)
        activity.runOnUiThread {
          webView?.evaluateJavascript("window.dispatchEvent(new Event('external-input-ready'))", null)
        }
      }
    }
  }

  private fun readFile(uri: Uri?): String {
    require(uri?.scheme == "content") { "请选择本机文本文件或分享文字" }
    return activity.contentResolver.openInputStream(uri!!)?.use { ExternalText.read(it) }
      ?: throw IllegalArgumentException("无法读取这个文本文件，请重新分享")
  }
}
