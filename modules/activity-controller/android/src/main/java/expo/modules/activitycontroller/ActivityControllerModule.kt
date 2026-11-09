package expo.modules.activitycontroller

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Instant
import java.time.OffsetDateTime
import kotlin.math.roundToInt

/**
 * Android counterpart of the iOS Live Activities: the organiser's check-in
 * progress and the attendee's ticket, each as an ongoing notification. On
 * Android 16+ (API 36) they are requested as promoted "Live Updates" (status
 * bar chip, top of the shade, lock screen); the check-in one uses
 * Notification.ProgressStyle. Older versions get a plain ongoing notification
 * with the same content.
 */
class ActivityControllerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val notificationManager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private val prefs
    get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("ActivityController")

    Function("areLiveActivitiesEnabled") { canNotify() }

    // Android 16+: whether the user lets Attend's ongoing notifications be
    // promoted to Live Updates. Older versions: whether notifications can show.
    Function("canPostLiveUpdates") {
      if (!canNotify()) return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
        notificationManager.canPostPromotedNotifications()
      } else {
        true
      }
    }

    // Opens the system page where the user can allow notifications or, once
    // they are allowed, Live Updates (Android 16+).
    Function("openLiveUpdateSettings") {
      val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA && canNotify()) {
        Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS
      } else {
        Settings.ACTION_APP_NOTIFICATION_SETTINGS
      }
      val intent = Intent(action)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(intent) }.isSuccess
    }

    AsyncFunction("startLiveActivity") { eventId: String, eventName: String, checkedInCount: Int, totalCount: Int ->
      if (!canNotify()) return@AsyncFunction false
      prefs.edit()
        .putString(KEY_EVENT_ID, eventId)
        .putString(KEY_EVENT_NAME, eventName)
        .apply()
      postEvent(eventName, checkedInCount, totalCount)
    }

    AsyncFunction("updateLiveActivity") { checkedInCount: Int, totalCount: Int ->
      if (!isShowing(EVENT_NOTIFICATION_ID)) return@AsyncFunction false
      val eventName = prefs.getString(KEY_EVENT_NAME, null) ?: return@AsyncFunction false
      postEvent(eventName, checkedInCount, totalCount)
    }

    AsyncFunction("stopLiveActivity") {
      notificationManager.cancel(EVENT_NOTIFICATION_ID)
      prefs.edit().remove(KEY_EVENT_ID).remove(KEY_EVENT_NAME).apply()
      true
    }

    Function("isLiveActivityRunning") { isShowing(EVENT_NOTIFICATION_ID) }

    AsyncFunction("startTicketActivity") { eventName: String, venue: String, shortCode: String, startsAtIso: String, checkedIn: Boolean ->
      if (!canNotify()) return@AsyncFunction false
      postTicket(eventName, venue, shortCode, parseIso(startsAtIso), checkedIn)
    }

    AsyncFunction("stopTicketActivity") {
      notificationManager.cancel(TICKET_NOTIFICATION_ID)
      true
    }

    Function("isTicketActivityRunning") { isShowing(TICKET_NOTIFICATION_ID) }
  }

  // ---------------------------------------------------------------------------

  private fun canNotify(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
    ensureChannel()
    val channel = notificationManager.getNotificationChannel(CHANNEL_ID)
    return channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
  }

  private fun ensureChannel() {
    if (notificationManager.getNotificationChannel(CHANNEL_ID) != null) return
    // Live Updates must not use an IMPORTANCE_MIN channel. Default importance
    // keeps the status bar icon/chip; sound and vibration are off because
    // these notifications update constantly.
    val channel = NotificationChannel(CHANNEL_ID, "Live updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "Check-in progress for the event you're running and your ticket for an upcoming event."
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    notificationManager.createNotificationChannel(channel)
  }

  private fun isShowing(id: Int): Boolean =
    runCatching { notificationManager.activeNotifications.any { it.id == id } }.getOrDefault(false)

  private fun openIntent(url: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun postEvent(eventName: String, checkedInCount: Int, totalCount: Int): Boolean {
    val total = totalCount.coerceAtLeast(0)
    val checkedIn = checkedInCount.coerceAtLeast(0)
    val percent = if (total > 0) ((checkedIn.toDouble() / total) * 100).roundToInt() else 0
    val title = eventName
    val text = "$checkedIn of $total checked in · $percent%"
    val chip = "$checkedIn/$total"
    val tap = openIntent(SCANNER_URL, EVENT_NOTIFICATION_ID)

    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
      val max = total.coerceAtLeast(1)
      val style = Notification.ProgressStyle()
        .setStyledByProgress(true)
        .setProgressSegments(listOf(Notification.ProgressStyle.Segment(max).setColor(ACCENT)))
        .setProgress(checkedIn.coerceAtMost(max))
      Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.attend_live_scan)
        .setContentTitle(title)
        .setContentText(text)
        .setSubText("Check-in")
        .setShortCriticalText(chip)
        .setStyle(style)
        .setColor(ACCENT)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_PROGRESS)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentIntent(tap)
        .setRequestPromotedOngoing(true)
        .build()
    } else {
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.attend_live_scan)
        .setContentTitle(title)
        .setContentText(text)
        .setSubText("Check-in")
        .setProgress(total.coerceAtLeast(1), checkedIn, false)
        .setColor(ACCENT)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(tap)
        .build()
    }
    return notify(EVENT_NOTIFICATION_ID, notification)
  }

  private fun postTicket(eventName: String, venue: String, shortCode: String, startsAt: Long?, checkedIn: Boolean): Boolean {
    val now = System.currentTimeMillis()
    // Same as iOS: a countdown to doors until checked in.
    val countdown = !checkedIn && startsAt != null && startsAt > now
    val text = if (checkedIn) "Checked in · $venue" else venue
    val bigText = "$text\nAttendee pass $shortCode"
    val tap = openIntent(TICKETS_URL, TICKET_NOTIFICATION_ID)

    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
      Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.attend_live_ticket)
        .setContentTitle(eventName)
        .setContentText(text)
        .setSubText(shortCode)
        .setStyle(Notification.BigTextStyle().bigText(bigText))
        .setColor(ACCENT)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_EVENT)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentIntent(tap)
        .apply {
          if (countdown) {
            setWhen(startsAt!!).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
          } else {
            setShowWhen(false)
          }
          if (checkedIn) setShortCriticalText("Checked in")
        }
        .setRequestPromotedOngoing(true)
        .build()
    } else {
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.attend_live_ticket)
        .setContentTitle(eventName)
        .setContentText(text)
        .setSubText(shortCode)
        .setStyle(NotificationCompat.BigTextStyle().bigText(bigText))
        .setColor(ACCENT)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_EVENT)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(tap)
        .apply {
          if (countdown) {
            setWhen(startsAt!!).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
          } else {
            setShowWhen(false)
          }
        }
        .build()
    }
    return notify(TICKET_NOTIFICATION_ID, notification)
  }

  private fun notify(id: Int, notification: Notification): Boolean =
    try {
      notificationManager.notify(id, notification)
      true
    } catch (e: SecurityException) {
      false
    }

  private fun parseIso(value: String): Long? =
    runCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }.getOrNull()
      ?: runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()

  companion object {
    private const val CHANNEL_ID = "attend_live_updates"
    private const val PREFS = "attend_live_updates"
    private const val KEY_EVENT_ID = "eventId"
    private const val KEY_EVENT_NAME = "eventName"
    private const val EVENT_NOTIFICATION_ID = 7301
    private const val TICKET_NOTIFICATION_ID = 7302
    // Same destinations as the iOS Live Activity widget URLs.
    private const val SCANNER_URL = "attend://scanner"
    private const val TICKETS_URL = "attend://my-tickets"
    private val ACCENT = Color.parseColor("#EC3750")
  }
}
