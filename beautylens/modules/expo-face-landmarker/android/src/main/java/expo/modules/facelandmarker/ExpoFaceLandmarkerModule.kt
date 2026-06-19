package expo.modules.facelandmarker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream

class ExpoFaceLandmarkerModule : Module() {
  private var faceLandmarker: FaceLandmarker? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoFaceLandmarker")

    AsyncFunction("detectFromImageAsync") { imageUri: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is unavailable")

      val bitmap = loadBitmap(imageUri)
        ?: throw IllegalArgumentException("Could not decode image: $imageUri")

      val landmarker = faceLandmarker ?: createFaceLandmarker().also {
        faceLandmarker = it
      }

      val mpImage = BitmapImageBuilder(bitmap).build()
      val result = landmarker.detect(mpImage)
      val faceLandmarks = result.faceLandmarks().firstOrNull()

      if (faceLandmarks == null) {
        return@AsyncFunction mapOf(
          "status" to "success",
          "face_detected" to false,
          "landmarks" to emptyList<Map<String, Double>>(),
          "num_landmarks" to 0,
          "image_dimensions" to mapOf(
            "width" to bitmap.width,
            "height" to bitmap.height
          ),
          "message" to "No face detected in image"
        )
      }

      val landmarks = faceLandmarks.map { landmark ->
        mapOf(
          "x" to (landmark.x() * bitmap.width).toDouble(),
          "y" to (landmark.y() * bitmap.height).toDouble(),
          "z" to (landmark.z() * bitmap.width).toDouble()
        )
      }

      val xs = landmarks.map { it["x"] ?: 0.0 }
      val ys = landmarks.map { it["y"] ?: 0.0 }
      val minX = xs.minOrNull() ?: 0.0
      val maxX = xs.maxOrNull() ?: 0.0
      val minY = ys.minOrNull() ?: 0.0
      val maxY = ys.maxOrNull() ?: 0.0

      mapOf(
        "status" to "success",
        "face_detected" to true,
        "landmarks" to landmarks,
        "num_landmarks" to landmarks.size,
        "bbox" to mapOf(
          "x" to minX,
          "y" to minY,
          "width" to maxX - minX,
          "height" to maxY - minY
        ),
        "image_dimensions" to mapOf(
          "width" to bitmap.width,
          "height" to bitmap.height
        )
      )
    }
  }

  private fun createFaceLandmarker(): FaceLandmarker {
    val context = appContext.reactContext
      ?: throw IllegalStateException("React context is unavailable")

    val modelName = "face_landmarker.task"
    val assetExists = try {
      context.assets.open(modelName).close()
      true
    } catch (_: Exception) {
      false
    }

    if (!assetExists) {
      throw IllegalStateException(
        "Missing $modelName. Add it to modules/expo-face-landmarker/android/src/main/assets/."
      )
    }

    val baseOptions = BaseOptions.builder()
      .setModelAssetPath(modelName)
      .build()

    val options = FaceLandmarker.FaceLandmarkerOptions.builder()
      .setBaseOptions(baseOptions)
      .setRunningMode(RunningMode.IMAGE)
      .setNumFaces(1)
      .setMinFaceDetectionConfidence(0.5f)
      .setMinFacePresenceConfidence(0.5f)
      .setMinTrackingConfidence(0.5f)
      .build()

    return FaceLandmarker.createFromOptions(context, options)
  }

  private fun loadBitmap(imageUri: String): Bitmap? {
    val context = appContext.reactContext ?: return null
    val uri = Uri.parse(imageUri)

    if (uri.scheme == null) {
      return BitmapFactory.decodeFile(imageUri)
    }

    if (uri.scheme == "file") {
      return BitmapFactory.decodeFile(File(uri.path ?: return null).absolutePath)
    }

    val stream: InputStream = context.contentResolver.openInputStream(uri) ?: return null
    return stream.use { BitmapFactory.decodeStream(it) }
  }
}
