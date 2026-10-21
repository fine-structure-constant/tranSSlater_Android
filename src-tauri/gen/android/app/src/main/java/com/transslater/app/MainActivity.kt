package com.transslater.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private var keyboardVisible = false

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    appWebView = webView
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("window.__transslaterBack ? window.__transslaterBack() : false") { handled ->
          if (handled != "true") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Keep the app's controls outside status/navigation bars and display cutouts.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(safe.left, safe.top, safe.right, maxOf(safe.bottom, ime.bottom))
      val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
      if (visible != keyboardVisible) {
        keyboardVisible = visible
        appWebView?.evaluateJavascript("document.documentElement.classList.toggle('keyboard-open', $visible)", null)
      }
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
