import os
import urllib.request
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

# 1. Ensure the hand landmarker model file exists
MODEL_PATH = "hand_landmarker.task"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

if not os.path.exists(MODEL_PATH):
    print("Downloading hand_landmarker.task model...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Model downloaded successfully.")

# 2. Configure the Hand Tracking model using MediaPipe Tasks API
base_options = mp_tasks.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    running_mode=vision.RunningMode.IMAGE
)

# 3. Open the default laptop camera (index 0)
cap = cv2.VideoCapture(0)

# 4. Run hand detection loop
with vision.HandLandmarker.create_from_options(options) as landmarker:
    print("Press 'q' to quit.")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("Failed to grab frame.")
            break

        # Flip the frame horizontally for a natural selfie-view
        frame = cv2.flip(frame, 1)

        # Convert the BGR image (OpenCV default) to RGB (MediaPipe requirement)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Process the frame and find hands
        results = landmarker.detect(mp_image)

        # 5. Draw the hand landmarks if hands are detected
        if results.hand_landmarks:
            for hand_landmarks in results.hand_landmarks:
                # Draw the dots and connecting lines on the original frame
                vision.drawing_utils.draw_landmarks(
                    frame,
                    hand_landmarks,
                    vision.HandLandmarksConnections.HAND_CONNECTIONS,
                    vision.drawing_utils.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=4),  # Landmarks color
                    vision.drawing_utils.DrawingSpec(color=(255, 0, 0), thickness=2, circle_radius=2)   # Connections color
                )

        # 6. Display the resulting frame
        cv2.imshow('MediaPipe Hand Tracker', frame)

        # Wait for 1 ms and check if the 'q' key is pressed to exit
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

# Clean up resources
cap.release()
cv2.destroyAllWindows()