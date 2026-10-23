let detectorPromise;

/**
 * Loads MediaPipe only when automatic framing is requested. The singleton is
 * reset after a failed initialization so a transient error does not poison the
 * full desktop session.
 */
export async function getFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const assetUrl = (name) =>
        new URL(`./mediapipe/${name}`, document.baseURI).href;
      const vision = await FilesetResolver.forVisionTasks(
        new URL("./mediapipe", document.baseURI).href.replace(/\/$/, ""),
      );

      return FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: assetUrl("blaze_face_short_range.tflite"),
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.55,
      });
    })().catch((error) => {
      detectorPromise = null;
      throw error;
    });
  }

  return detectorPromise;
}
