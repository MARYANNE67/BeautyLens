import ExpoModulesCore
import MediaPipeTasksVision
import UIKit

public class ExpoFaceLandmarkerModule: Module {
  private var faceLandmarker: FaceLandmarker?

  public func definition() -> ModuleDefinition {
    Name("ExpoFaceLandmarker")

    AsyncFunction("detectFromImageAsync") { (imageUri: String) throws -> [String: Any] in
      guard let image = Self.loadImage(imageUri: imageUri) else {
        throw Exception(name: "ImageDecodeError", description: "Could not decode image: \(imageUri)")
      }

      let landmarker = try self.getFaceLandmarker()
      let mpImage = try MPImage(uiImage: image)
      let result = try landmarker.detect(image: mpImage)

      guard let faceLandmarks = result.faceLandmarks.first else {
        return [
          "status": "success",
          "face_detected": false,
          "landmarks": [],
          "num_landmarks": 0,
          "image_dimensions": [
            "width": Int(image.size.width),
            "height": Int(image.size.height)
          ],
          "message": "No face detected in image"
        ]
      }

      let width = Double(image.size.width)
      let height = Double(image.size.height)
      let landmarks = faceLandmarks.map { landmark -> [String: Double] in
        [
          "x": Double(landmark.x) * width,
          "y": Double(landmark.y) * height,
          "z": Double(landmark.z) * width
        ]
      }

      let xs = landmarks.map { $0["x"] ?? 0 }
      let ys = landmarks.map { $0["y"] ?? 0 }
      let minX = xs.min() ?? 0
      let maxX = xs.max() ?? 0
      let minY = ys.min() ?? 0
      let maxY = ys.max() ?? 0

      return [
        "status": "success",
        "face_detected": true,
        "landmarks": landmarks,
        "num_landmarks": landmarks.count,
        "bbox": [
          "x": minX,
          "y": minY,
          "width": maxX - minX,
          "height": maxY - minY
        ],
        "image_dimensions": [
          "width": Int(image.size.width),
          "height": Int(image.size.height)
        ]
      ]
    }
  }

  private func getFaceLandmarker() throws -> FaceLandmarker {
    if let faceLandmarker {
      return faceLandmarker
    }

    guard let modelPath = Bundle.main.path(forResource: "face_landmarker", ofType: "task") else {
      throw Exception(
        name: "MissingModel",
        description: "Missing face_landmarker.task. Add it to modules/expo-face-landmarker/ios/Resources/."
      )
    }

    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .image
    options.numFaces = 1
    options.minFaceDetectionConfidence = 0.5
    options.minFacePresenceConfidence = 0.5
    options.minTrackingConfidence = 0.5

    let landmarker = try FaceLandmarker(options: options)
    faceLandmarker = landmarker
    return landmarker
  }

  private static func loadImage(imageUri: String) -> UIImage? {
    if imageUri.hasPrefix("file://"), let url = URL(string: imageUri) {
      return UIImage(contentsOfFile: url.path)
    }

    if FileManager.default.fileExists(atPath: imageUri) {
      return UIImage(contentsOfFile: imageUri)
    }

    return nil
  }
}
